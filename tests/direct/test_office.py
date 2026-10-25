import sys
import pytest
from conftest import OUT_URL, OUTPUTS, evidence


def module(office):
    return sys.modules[office._instance.__class__.__module__]


def ready(suite, monkeypatch):
    registry, vault, office = suite
    monkeypatch.setattr(office._instance, '_verify_commit', lambda run, tx: tx)
    office.start_round('r','0x' + 'ab'*32)
    return registry, vault, office


def test_commitment_and_sample_are_immutable(suite, direct_vm, monkeypatch):
    registry, vault, office = ready(suite, monkeypatch)
    run = office.get_run('r')
    round_data = office.get_round('r',0)
    assert run['status'] == 'grading'
    assert len(set(round_data['sample'])) == 2
    assert round_data['seed'] == '0x'+'ab'*32
    with direct_vm.expect_revert('already started'):
        office.start_round('r','0x'+'bc'*32)
    with direct_vm.expect_revert('Complete'):
        office.finalize('r')


def test_item_grading_and_finalization(suite, direct_vm, monkeypatch):
    _, _, office = ready(suite, monkeypatch)
    direct_vm.mock_llm('.*independent Assay examiner.*', {'score': 1, 'incorrect': False, 'reason': 'The answer is four.'})
    office.grade_item('r',0)
    with direct_vm.expect_revert('once'):
        office.grade_item('r',0)
    office.grade_item('r',1)
    office.finalize('r')
    run = office.get_run('r')
    assert run['status'] == 'published'
    assert run['score_bps'] == 10000
    assert 0 <= run['low_bps'] < run['high_bps'] <= 10000
    assert office.get_round('r',0)['n'] == 2
    with direct_vm.expect_revert('Complete'):
        office.finalize('r')


def test_submission_identity_and_locked_outputs(suite, direct_vm, direct_bob):
    _, vault, office = suite
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert('authorized'):
        office.submit_run('x','b',OUT_URL,'0'*64,'Other','other-account')
    actor = str(direct_bob) if not isinstance(direct_bob, bytes) else '0x'+direct_bob.hex()
    vault.lock('x',actor,0)
    with direct_vm.expect_revert('hash mismatch'):
        office.submit_run('x','b',OUT_URL,'0'*64,'Other',actor)
    bad_url = 'https://example.org/missing'
    digest = evidence(direct_vm,bad_url, {'outputs': {'0': '4'}})
    with direct_vm.expect_revert('Complete'):
        office.submit_run('x','b',bad_url,digest,'Other',actor)


def test_fresh_challenge_and_failed_challenge(suite, direct_vm, direct_bob, monkeypatch):
    _, vault, office = ready(suite, monkeypatch)
    direct_vm.mock_llm('.*independent Assay examiner.*', {'score': 1, 'incorrect': False, 'reason': 'Correct.'})
    office.grade_item('r',0); office.grade_item('r',1); office.finalize('r')
    first = set(office.get_round('r',0)['sample'])
    direct_vm.sender = direct_bob
    actor = str(direct_bob) if not isinstance(direct_bob, bytes) else '0x'+direct_bob.hex()
    vault.lock('c',actor,0)
    office.challenge('r','c',actor)
    with direct_vm.expect_revert('unavailable'):
        office.challenge('r','c2',actor)
    office.start_round('r','0x'+'cd'*32)
    assert not first.intersection(office.get_round('r',1)['sample'])
    office.grade_item('r',0); office.grade_item('r',1); office.finalize('r')
    assert office.get_run('r')['survived'] == 1
    assert not office.get_round('r',1)['challenge_successful']


def test_binary_and_error_set_comparator(suite):
    compare = module(suite[2]).compare_grades
    def grades(scores, errors):
        return [{'id': str(i), 'score': score, 'incorrect': i in errors} for i,score in enumerate(scores)]
    binary = grades([1,0],{1})
    assert compare(binary,binary,1,0,10000)
    assert not compare(binary,grades([0,1],{0}),1,0,10000)
    # Identical aggregate but disjoint errors must fail.
    assert not compare(grades([10,8,8,10],{1,2}),grades([8,10,10,8],{0,3}),10,1000,5000)
    assert compare(grades([10,8,8,10],{1,2}),grades([10,8,8,9],{1,2}),10,1000,7500)
    assert not compare(grades([10,8],{1}),grades([10,8],set()),10,1000,5000)
    assert compare(grades([10,10],set()),grades([10,10],set()),10,0,10000)
    assert not compare([],[],1,0,10000)
    assert not compare(binary,[{'id':'0','score':True,'incorrect':False}],1,0,10000)


def test_sample_and_confidence_math(suite):
    m = module(suite[2])
    a = m.sample_indices('a',100,20,[])
    assert a == m.sample_indices('a',100,20,[])
    b = m.sample_indices('b',100,20,a)
    assert not set(a).intersection(b)
    for scores, scale in [([0]*10,1),([1]*10,1),([0,1]*5,1),([3,7],10)]:
        interval = m.confidence(scores,scale)
        assert 0 <= interval['low_bps'] <= interval['score_bps'] <= interval['high_bps'] <= 10000
    assert 4800 < m.confidence([0,1]*50,1)['score_bps'] < 5200


@pytest.mark.parametrize('result', [None,{}, {'score':1,'incorrect':True,'reason':'x'}, {'score':3,'incorrect':False,'reason':'x'}, {'score':'1','incorrect':False,'reason':'x'}, {'score':1,'incorrect':False,'reason':''}])
def test_malformed_grades_rejected(suite, direct_vm, result):
    with direct_vm.expect_revert('LLM_ERROR'):
        module(suite[2]).grade_response(result,'x',1)

def test_successful_challenge_slashes_materially_lower_score(suite,direct_vm,direct_bob,monkeypatch):
    registry,vault,office=suite
    registry.get_benchmark('b')['sample_size']=4
    ready(suite,monkeypatch)
    direct_vm.mock_llm('.*independent Assay examiner.*',{'score':1,'incorrect':False,'reason':'Correct.'})
    for i in range(4):office.grade_item('r',i)
    office.finalize('r')
    direct_vm.sender=direct_bob
    actor=str(direct_bob)
    vault.lock('c',actor,0);office.challenge('r','c',actor);office.start_round('r','0x'+'ef'*32)
    direct_vm.clear_mocks()
    from conftest import DATA,OUTPUTS,URL,OUT_URL,evidence
    evidence(direct_vm,URL,DATA);evidence(direct_vm,OUT_URL,OUTPUTS)
    direct_vm.mock_llm('.*independent Assay examiner.*',{'score':0,'incorrect':True,'reason':'Incorrect.'})
    for i in range(4):office.grade_item('r',i)
    office.finalize('r')
    assert office.get_run('r')['status']=='slashed'
    assert office.get_run('r')['score_bps']==0
    assert office.get_round('r',1)['challenge_successful']


def test_receipt_binding_rejects_forged_method(suite,direct_vm):
    import base64,json
    office=suite[2];m=module(office);run=office.get_run('r')
    tx={'status':'FINALIZED','from_address':run['sender'],'to_address':str(office.address),
        'consensus_data':{'leader_receipt':[{'execution_result':'SUCCESS'}]},
        'data':{'calldata':base64.b64encode(m.calldata.encode({'method':'unrelated','args':[]})).decode()}}
    direct_vm.mock_web('https://studio.genlayer.com/api',{'response':{'status':200,'headers':{},'body':json.dumps({'result':tx}).encode()},'method':'POST'})
    with direct_vm.expect_revert('does not commit'):
        office.start_round('r','0x'+'ab'*32)


def test_wilson_known_interval(suite):
    interval=module(suite[2]).confidence([1]*10,1)
    assert 7200<=interval['low_bps']<=7250
    assert interval['high_bps']==10000
    mixed=module(suite[2]).confidence([0,1]*5,1)
    assert 2300<=mixed['low_bps']<=2400
    assert 7600<=mixed['high_bps']<=7700

def test_receipt_binding_accepts_exact_commitment(suite,direct_vm):
    import base64,json
    office=suite[2];m=module(office);run=office.get_run('r')
    args=[run['id'],run['benchmark_id'],run['outputs_url'],run['outputs_hash'],run['model'],run['owner']]
    tx={'status':'FINALIZED','from_address':run['sender'],'to_address':str(office.address),
        'consensus_data':{'leader_receipt':[{'execution_result':'SUCCESS'}]},
        'data':{'calldata':base64.b64encode(m.calldata.encode({'method':'submit_run','args':args})).decode()}}
    direct_vm.mock_web('https://studio.genlayer.com/api',{'response':{'status':200,'headers':{},'body':json.dumps({'result':tx}).encode()},'method':'POST'})
    office.start_round('r','0x'+'ab'*32)
    assert office.get_round('r',0)['seed']=='0x'+'ab'*32
