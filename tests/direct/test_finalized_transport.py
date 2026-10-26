import json
import sys
from types import SimpleNamespace
import pytest
import rlp


@pytest.mark.parametrize('file', ['bond_vault', 'assay_office'])
@pytest.mark.parametrize('identifier', ['r', 'r'*80])
def test_finalized_bridge_matches_sdk_wire_format(direct_deploy, monkeypatch, file, identifier):
    args = [0] if file == 'bond_vault' else ['0x'+'11'*20, '0x'+'22'*20]
    contract = direct_deploy('contracts/'+file+'.py', *args)
    from genlayer import gl, Address
    module = sys.modules[contract._instance.__class__.__module__]
    result = {'id': identifier, 'settled': False}
    def post(url, *, body, headers):
        request = json.loads(body)
        assert request['method'] == 'gen_call'
        params = request['params'][0]
        assert params['transaction_hash_variant'] == 'latest-final'
        assert params['to'] == str(Address('0x'+'33'*20))
        encoded, leader_only = rlp.decode(bytes.fromhex(params['data'][2:]))
        assert leader_only == b'\x00'
        assert module.calldata.decode(encoded) == {'method': 'get_lock', 'args': [identifier]}
        return SimpleNamespace(status=200, body=json.dumps({'result': module.calldata.encode(result).hex()}).encode())
    monkeypatch.setattr(gl.nondet.web, 'post', post)
    assert module.finalized_view(Address('0x'+'33'*20), 'get_lock', [identifier]) == result


@pytest.mark.parametrize('response', [
    {'error': {'message': 'unavailable'}},
    {'result': {'status': {'code': 1}, 'data': ''}},
    {'result': 'not-hex'},
])
def test_finalized_bridge_fails_closed(direct_deploy, direct_vm, monkeypatch, response):
    contract = direct_deploy('contracts/bond_vault.py', 0)
    from genlayer import gl, Address
    module = sys.modules[contract._instance.__class__.__module__]
    monkeypatch.setattr(gl.nondet.web, 'post', lambda *args, **kwargs: SimpleNamespace(status=200, body=json.dumps(response).encode()))
    with direct_vm.expect_revert('Finalized contract state unavailable'):
        module.finalized_view(Address('0x'+'33'*20), 'get_lock', ['r'])
