import base64
import copy
import json
import sys
from types import SimpleNamespace
import pytest

PARENT = '0x' + 'ab' * 32
CHILD = '0x' + 'cd' * 32
RECIPIENT = '0x' + '11' * 20


@pytest.fixture
def proof(direct_deploy, direct_vm, direct_alice, monkeypatch):
    vault = direct_deploy('contracts/bond_vault.py', 0)
    from genlayer import gl
    module = sys.modules[vault._instance.__class__.__module__]
    request = {'method': 'withdraw_for', 'args': ['w', 'actor', 20, RECIPIENT],
               'sender': str(gl.message.sender_address), 'recipient': RECIPIENT, 'amount': 20}
    parent = {'status': 'FINALIZED', 'to_address': str(gl.message.contract_address),
              'from_address': request['sender'], 'consensus_data': {'leader_receipt': [{'execution_result': 'SUCCESS'}]},
              'data': {'calldata': base64.b64encode(module.calldata.encode({'method': request['method'], 'args': request['args']})).decode()},
              'triggered_transactions': [CHILD]}
    child = {'type': 0, 'status': 'FINALIZED', 'from_address': parent['to_address'],
             'to_address': RECIPIENT, 'value': '20', 'value_credited': True, 'triggered_by': PARENT}
    txs = {PARENT: parent, CHILD: child}
    monkeypatch.setattr(gl.nondet.web, 'post', lambda url, *, body, headers:
        SimpleNamespace(status=200, body=json.dumps({'result': txs[json.loads(body)['params'][0]]}).encode()))
    return vault, module, request, parent, child


def test_native_delivery_proof_and_keyword_arguments(proof):
    vault, module, request, parent, child = proof
    assert vault._instance._withdrawal_proof(request, PARENT) == {'status': 'confirmed', 'child': CHILD}
    parent['data']['calldata'] = base64.b64encode(module.calldata.encode({'method': 'withdraw_for', 'args': ['w'],
        'kwargs': {'actor': 'actor', 'amount': 20, 'recipient': RECIPIENT}})).decode()
    assert vault._instance._withdrawal_proof(request, PARENT)['status'] == 'confirmed'


@pytest.mark.parametrize('field,value', [('triggered_by', '0x'+'ef'*32), ('type', 2),
    ('from_address', RECIPIENT), ('to_address', '0x'+'22'*20), ('value', '21'),
    ('value_credited', None), ('status', 'ACCEPTED')])
def test_unrelated_or_unfinalized_child_cannot_confirm(proof, field, value):
    vault, _, request, _, child = proof
    child[field] = value
    assert vault._instance._withdrawal_proof(request, PARENT)['status'] == 'pending'


@pytest.mark.parametrize('status,expected', [('FINALIZED', 'failed'), ('UNDETERMINED', 'pending'), ('CANCELED', 'pending')])
def test_refund_requires_final_failed_delivery(proof, status, expected):
    vault, _, request, _, child = proof
    child.update(status=status, value_credited=False)
    assert vault._instance._withdrawal_proof(request, PARENT)['status'] == expected


@pytest.mark.parametrize('change', ['sender', 'destination', 'method', 'arguments', 'duplicate_arguments', 'invalid_calldata', 'execution'])
def test_mismatched_parent_rejected(proof, direct_vm, change):
    vault, module, request, parent, _ = proof
    if change == 'sender': parent['from_address'] = RECIPIENT
    elif change == 'destination': parent['to_address'] = RECIPIENT
    elif change == 'execution': parent['consensus_data']['leader_receipt'][0]['execution_result'] = 'ERROR'
    elif change == 'invalid_calldata': parent['data']['calldata'] = 'bad'
    else:
        decoded = {'method': request['method'], 'args': copy.copy(request['args'])}
        if change == 'method': decoded['method'] = 'withdraw'
        elif change == 'arguments': decoded['args'][0] = 'other-withdrawal'
        else: decoded['kwargs'] = {'withdrawal_id': 'w'}
        parent['data']['calldata'] = base64.b64encode(module.calldata.encode(decoded)).decode()
    with direct_vm.expect_revert(): vault._instance._withdrawal_proof(request, PARENT)


def test_unfinalized_parent_is_retryable(proof, direct_vm):
    vault, _, request, parent, _ = proof
    parent['status'] = 'ACCEPTED'
    with direct_vm.expect_revert('not finalized'): vault._instance._withdrawal_proof(request, PARENT)
