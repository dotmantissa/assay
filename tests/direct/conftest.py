import hashlib
import json
import pytest

DATA = {'items': [{'id': str(i), 'question': 'What is two plus two?', 'reference': '4'} for i in range(8)]}
OUTPUTS = {'outputs': {str(i): '4' for i in range(8)}}
URL = 'https://example.org/dataset.json'
OUT_URL = 'https://example.org/outputs.json'

def evidence(vm, url, data):
    body = json.dumps(data).encode()
    vm.mock_web(url.replace('.', r'\.'), {'response': {'status': 200, 'headers': {}, 'body': body}, 'method': 'GET'})
    return hashlib.sha256(body).hexdigest()

@pytest.fixture
def suite(direct_vm, direct_deploy, direct_alice, monkeypatch):
    from types import SimpleNamespace
    direct_vm.sender = direct_alice
    office = direct_deploy('contracts/assay_office.py', '0x'+'11'*20, '0x'+'22'*20)
    from genlayer import gl
    digest = evidence(direct_vm, URL, DATA)
    benchmark = {'id':'b','name':'Arithmetic','dataset_url':URL,'content_hash':digest,
        'rubric':'Give one point exactly when the answer is correct.', 'sample_size':2,
        'scale':1,'tolerance_bps':0,'overlap_bps':10000,'item_count':8}
    locks = {}
    def lock(lock_id, actor, amount):
        locks[lock_id] = {'id':lock_id,'owner':actor,'amount':amount,'settled':False}
    vault = SimpleNamespace(lock=lock, get_lock=lambda key: locks[key], settle=lambda *args: None)
    registry = SimpleNamespace(get_benchmark=lambda key: benchmark)
    monkeypatch.setattr(gl._cached_gl if hasattr(gl, '_cached_gl') else gl, 'get_contract_at',
        lambda address: SimpleNamespace(view=lambda: registry if str(address).lower() == '0x'+'11'*20 else vault,
                                      emit=lambda **kwargs: vault))
    out_digest = evidence(direct_vm, OUT_URL, OUTPUTS)
    actor = '0x'+direct_alice.hex()
    vault.lock('r',actor,0)
    office.submit_run('r','b',OUT_URL,out_digest,'Actual model',actor)
    return registry,vault,office
