from conftest import identity
import sys
import base64
import json
import pytest
from conftest import OUT_URL, OUTPUTS, DATA, URL, evidence


def module(office):
    return sys.modules[office._instance.__class__.__module__]


def ready(suite, monkeypatch):
    monkeypatch.setattr(suite[2]._instance, '_verify_commit', lambda run, tx: tx)
    suite[2].start_round('r', '0x'+'ab'*32)
    return suite


def grade_all(office, vm, score=1):
    vm.clear_mocks()
    evidence(vm, URL, DATA); evidence(vm, OUT_URL, OUTPUTS)
    vm.mock_llm('.*independent Assay examiner.*', {'score': score, 'incorrect': score == 0, 'reason': 'Independent grade.'})
    for position in range(8):
        office.grade_item('r', position)
    office.finalize('r')


def challenge(suite, vm, bob, identifier='c'):
    _, vault, office = suite
    vm.sender = bob
    actor = identity(bob)
    vault.lock(identifier, actor, 0, 'r', office.get_run('r')['round_count'], 'challenge')
    office.challenge('r', identifier, actor)
    office.start_round('r', '0x'+'cd'*32)


def test_every_item_is_graded_independent_of_transaction_hash(suite, direct_vm, monkeypatch):
    registry, vault, office = ready(suite, monkeypatch)
    assert office.get_round('r', 0)['sample'] == list(range(8))
    assert office.get_round('r', 0)['seed'] == ''
    with direct_vm.expect_revert('already started'):
        office.start_round('r', '0x'+'bc'*32)
    with direct_vm.expect_revert('Complete'):
        office.finalize('r')
    grade_all(office, direct_vm)
    run = office.get_run('r')
    assert run['score_bps'] == 10000 and run['n'] == 8
    assert run['low_bps'] == run['high_bps'] == run['score_bps']
    assert run['certification'] == 'submitted artifact only'
    assert run['provenance'] == 'unverified submitter label'
    assert not vault.get_lock('r')['settled']


def test_challenge_waits_for_vault_and_recovers_failed_child(suite, direct_vm, direct_bob, monkeypatch):
    registry, vault, office = ready(suite, monkeypatch)
    grade_all(office, direct_vm)
    challenge(suite, direct_vm, direct_bob)
    grade_all(office, direct_vm, 0)
    assert office.get_run('r')['status'] == 'settling'
    assert office.get_run('r')['score_bps'] == 10000
    assert not vault.get_lock('c')['settled']
    # Drop the child transaction; explicit replay repairs it without publishing a false outcome.
    registry.queued.clear()
    operation = office.get_run('r')['pending_operation']
    with direct_vm.expect_revert('not finalized'):
        office.reconcile_settlement(operation)
    office.retry_settlement(operation)
    registry.drain()
    assert office.get_run('r')['status'] == 'slashed'
    assert office.get_run('r')['score_bps'] == 0
    assert office.get_round('r', 1)['settlement'] == 'confirmed'
    assert vault.get_lock('r')['settled'] and vault.get_lock('c')['settled']
    office.reconcile_settlement(operation)
    direct_vm.sender = office.address
    vault.execute(operation)
    registry.drain()
    assert office.get_run('r')['status'] == 'slashed'


def test_no_finite_sample_exhaustion_and_no_independence_badge(suite, direct_vm, direct_bob, monkeypatch):
    registry, vault, office = ready(suite, monkeypatch)
    grade_all(office, direct_vm)
    for identifier in ('c', 'c2', 'c3', 'c4'):
        challenge(suite, direct_vm, direct_bob, identifier)
        grade_all(office, direct_vm)
        assert office.get_run('r')['status'] == 'settling'
        registry.drain()
        assert office.get_round('r', office.get_run('r')['round_count']-1)['sample'] == list(range(8))
    assert office.get_run('r')['survived'] == 4
    assert not vault.get_lock('r')['settled']
    registry.clock[0] = office.get_run('r')['challenge_until']
    office.close_run('r')
    assert office.get_run('r')['status'] == 'releasing'
    registry.drain()
    assert office.get_run('r')['status'] == 'completed'
    assert vault.get_lock('r')['settled']


def test_bonds_cannot_change_role_round_run_or_be_consumed_twice(suite, direct_vm, direct_bob, monkeypatch):
    registry, vault, office = ready(suite, monkeypatch)
    grade_all(office, direct_vm)
    direct_vm.sender = direct_bob
    actor = identity(direct_bob)
    vault.lock('other', actor, 0, 'other', 0, 'run')
    with direct_vm.expect_revert('associated'):
        office.challenge('r', 'other', actor)
    vault.lock('wronground', actor, 0, 'r', 2, 'challenge')
    with direct_vm.expect_revert('associated'):
        office.challenge('r', 'wronground', actor)
    vault.lock('other-run', actor, 0, 'different', 1, 'challenge')
    with direct_vm.expect_revert('associated'):
        office.challenge('r', 'other-run', actor)
    challenge(suite, direct_vm, direct_bob)
    grade_all(office, direct_vm)
    registry.drain()
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert('associated'):
        office.challenge('r', 'c', actor)


def test_cancel_and_timeout_refund_both_bonds_without_resilience(suite, direct_vm, direct_bob, monkeypatch):
    registry, vault, office = ready(suite, monkeypatch)
    grade_all(office, direct_vm)
    challenge(suite, direct_vm, direct_bob)
    office.grade_item('r', 0)
    registry.clock[0] += 86400
    office.close_run('r')
    registry.drain()
    run = office.get_run('r')
    assert run['status'] == 'inconclusive' and run['score_bps'] is None and run['survived'] == 0
    assert vault.get_lock('r')['settled'] and vault.get_lock('c')['settled']


def test_cancel_original_and_unused_lock_tombstone(suite, direct_vm, direct_alice):
    registry, vault, office = suite
    vault.lock('failed', identity(direct_alice), 0, 'failed', 0, 'run')
    office.refund_unused('failed', identity(direct_alice))
    with direct_vm.expect_revert('associated'):
        office.submit_run('failed', 'b', OUT_URL, evidence(direct_vm, OUT_URL, OUTPUTS), 'Label', identity(direct_alice))
    registry.drain()
    assert vault.get_lock('failed')['settled']
    office.cancel_run('r', identity(direct_alice))
    registry.drain()
    assert office.get_run('r')['status'] == 'cancelled' and vault.get_lock('r')['settled']


def test_failed_submission_can_refund_unused_bond(suite, direct_vm, direct_alice):
    registry, vault, office = suite
    actor = identity(direct_alice)
    vault.lock('x', actor, 0, 'x', 0, 'run')
    with direct_vm.expect_revert('hash mismatch'):
        office.submit_run('x', 'b', OUT_URL, '0'*64, 'Label', actor)
    assert office.get_bond_use('x') == {}
    office.refund_unused('x', actor)
    registry.drain()
    assert vault.get_lock('x')['settled']


@pytest.mark.parametrize('challenged', [False, True])
def test_receipt_binding_accepts_actual_lowercase_actor(suite, direct_vm, direct_bob, monkeypatch, challenged):
    registry, vault, office = suite
    verifier = office._instance._verify_commit
    if challenged:
        ready(suite, monkeypatch)
        grade_all(office, direct_vm)
        monkeypatch.setattr(office._instance, '_verify_commit', verifier)
        direct_vm.sender = direct_bob
        actor = identity(direct_bob)
        vault.lock('c', actor, 0, 'r', 1, 'challenge')
        office.challenge('r', 'c', actor)
    run = office.get_run('r')
    args = [run['id'], run['challenge_id'], run['challenger'].lower()] if challenged else [run['id'], run['benchmark_id'], run['outputs_url'], run['outputs_hash'], run['model'], run['owner'].lower()]
    tx = {'status': 'FINALIZED', 'from_address': run['challenge_sender'] if challenged else run['sender'], 'to_address': str(office.address),
        'consensus_data': {'leader_receipt': [{'execution_result': 'SUCCESS'}]},
        'data': {'calldata': base64.b64encode(module(office).calldata.encode({'method': 'challenge' if challenged else 'submit_run', 'args': args})).decode()}}
    direct_vm.mock_web('https://studio.genlayer.com/api', {'response': {'status': 200, 'headers': {}, 'body': json.dumps({'result': tx}).encode()}, 'method': 'POST'})
    office.start_round('r', '0x'+'ab'*32)
    assert office.get_round('r', 1 if challenged else 0)['commitment_tx'] == '0x'+'ab'*32


def test_scaled_item_swaps_and_payout_disagreement_rejected(suite):
    m = module(suite[2])
    def grades(scores):
        return [{'id': str(i), 'score': score, 'incorrect': True} for i, score in enumerate(scores)]
    assert not m.compare_grades(grades([60, 80]), grades([80, 60]), 100, 0, 10000)
    assert m.compare_grades(grades([60]*100), grades([70]*100), 100, 1000, 10000)
    # Same tolerated grades, but they fall on opposite sides of the settlement threshold.
    assert not m.payout_agrees(grades([60]*100), grades([70]*100), grades([75]*100), 100, 1000)
    combined = m.accumulated(grades([100, 80]), grades([90, 100]))
    assert [g['score'] for g in combined] == [90, 80]
    assert m.assessment(combined, 100)['score_bps'] == 8500


def test_sdk_error_messages_and_transient_classification(suite):
    m = module(suite[2])
    from genlayer import gl
    error = gl.vm.UserError('[EXTERNAL] Evidence unavailable')
    assert not str(error).startswith('[EXTERNAL]')
    assert m.errors_agree(error, gl.vm.UserError('[EXTERNAL] Evidence unavailable'))
    assert not m.errors_agree(error, gl.vm.UserError('[EXTERNAL] Other'))
    assert m.errors_agree(gl.vm.UserError('[TRANSIENT] A'), gl.vm.UserError('[TRANSIENT] B'))
    assert not m.errors_agree(gl.vm.UserError('[LLM_ERROR] A'), gl.vm.UserError('[LLM_ERROR] A'))


@pytest.mark.parametrize('result', [None, {}, {'score': 1, 'incorrect': True, 'reason': 'x'}, {'score': 3, 'incorrect': False, 'reason': 'x'}, {'score': '1', 'incorrect': False, 'reason': 'x'}, {'score': 1, 'incorrect': False, 'reason': ''}])
def test_malformed_grades_rejected(suite, direct_vm, result):
    with direct_vm.expect_revert('LLM_ERROR'):
        module(suite[2]).grade_response(result, 'x', 1)


def test_validator_callback_independently_regrades_and_rejects_item_swaps(suite, monkeypatch):
    from genlayer import gl
    registry, vault, office = suite
    benchmark = registry.get_benchmark('b')
    benchmark.update(scale=100, tolerance_bps=1000)
    recorded = [{'id': '0', 'score': 60, 'incorrect': True}, {'id': '1', 'score': 80, 'incorrect': True}]
    swapped = [{'id': '0', 'score': 80, 'incorrect': True}, {'id': '1', 'score': 60, 'incorrect': True}]
    calls = []
    def grade(*args):
        calls.append(1)
        return swapped
    monkeypatch.setattr(office._instance, '_grade', grade)
    def consensus(leader, validator):
        assert not validator(gl.vm.Return(recorded))
        return recorded
    monkeypatch.setattr(gl.vm, 'run_nondet_unsafe', consensus)
    office._instance._consensus(office.get_run('r'), benchmark, [0, 1], recorded)
    assert len(calls) == 1


def test_expired_unused_lock_refund_and_tombstone(suite, direct_vm, direct_alice):
    registry, vault, office = suite
    vault.lock('abandoned', identity(direct_alice), 0, 'abandoned', 0, 'run')
    with direct_vm.expect_revert('not expired'):
        office.expire_unused('abandoned')
    registry.clock[0] += 86400
    office.expire_unused('abandoned')
    registry.drain()
    assert vault.get_lock('abandoned')['settled']
    assert office.get_bond_use('abandoned')['refunded']


def test_unsuccessful_regrade_reduces_headline_and_friendly_regrade_cannot_raise_it(suite, direct_vm, direct_bob, monkeypatch):
    registry, vault, office = ready(suite, monkeypatch)
    registry.get_benchmark('b').update(scale=10, tolerance_bps=1000)
    grade_all(office, direct_vm, 10)
    challenge(suite, direct_vm, direct_bob)
    grade_all(office, direct_vm, 9)
    registry.drain()
    assert office.get_run('r')['score_bps'] == 9000
    assert not office.get_round('r', 1)['challenge_successful']
    challenge(suite, direct_vm, direct_bob, 'friendly')
    grade_all(office, direct_vm, 10)
    registry.drain()
    assert office.get_run('r')['score_bps'] == 9000
