import hashlib
import json
import pytest
from types import SimpleNamespace

DATA = {'items': [{'id': str(i), 'question': 'What is two plus two?', 'reference': '4'} for i in range(8)]}
OUTPUTS = {'outputs': {str(i): '4' for i in range(8)}}
URL = 'https://example.org/dataset.json'
OUT_URL = 'https://example.org/outputs.json'


def evidence(vm, url, data):
    body = json.dumps(data).encode()
    vm.mock_web(url.replace('.', r'\.'), {'response': {'status': 200, 'headers': {}, 'body': body}, 'method': 'GET'})
    return hashlib.sha256(body).hexdigest()


def identity(value):
    return '0x'+value.hex() if isinstance(value, bytes) else str(value)


@pytest.fixture
def suite(direct_vm, direct_deploy, direct_alice, monkeypatch):
    import sys
    direct_vm.sender = direct_alice
    vault = direct_deploy('contracts/bond_vault.py', 0)
    from genlayer import gl
    vault_address = vault.address
    from genlayer.gl import genvm_contracts
    from gltest.direct.vm import InmemManager
    monkeypatch.setattr(genvm_contracts, '__known_contract__', None)
    direct_vm._storage = InmemManager()
    office = direct_deploy('contracts/assay_office.py', '0x'+'11'*20, str(vault_address))
    from genlayer import Address
    office_address = Address(direct_vm._contract_address)
    class Bound:
        def __init__(self, contract, address):
            self._contract = contract
            self._instance = contract._instance
            self.address = address
        def __getattr__(self, name):
            method = getattr(self._contract, name)
            def invoke(*args, **kwargs):
                original = gl.message
                gl.message = original._replace(contract_address=self.address)
                try:
                    return method(*args, **kwargs)
                finally:
                    gl.message = original
            return invoke
    vault, office = Bound(vault, vault_address), Bound(office, office_address)
    vault.configure(str(office.address))
    clock = [1_700_000_000]
    for contract in (office, vault):
        monkeypatch.setattr(sys.modules[contract._instance.__class__.__module__], 'now', lambda: clock[0])
    benchmark = {'id': 'b', 'name': 'Arithmetic', 'dataset_url': URL, 'content_hash': evidence(direct_vm, URL, DATA),
        'rubric': 'Give one point exactly when the answer is correct.', 'sample_size': 8,
        'scale': 1, 'tolerance_bps': 0, 'overlap_bps': 10000, 'item_count': 8, 'protocol': 2}
    registry = SimpleNamespace(get_benchmark=lambda key: benchmark)
    queued = []
    def proxy(address):
        target = registry if str(address).lower() == '0x'+'11'*20 else (vault if str(address) == str(vault.address) else office)
        def emit(**options):
            assert options['on'] == 'finalized'
            return SimpleNamespace(execute=lambda op: queued.append(('execute', op)), acknowledge=lambda op: queued.append(('acknowledge', op)))
        return SimpleNamespace(view=lambda **kwargs: target, emit=emit)
    monkeypatch.setattr(gl._cached_gl if hasattr(gl, '_cached_gl') else gl, 'get_contract_at', proxy)
    for contract in (office, vault):
        monkeypatch.setattr(sys.modules[contract._instance.__class__.__module__], 'finalized_view',
            lambda address, method, args: getattr(proxy(address).view(), method)(*args))
    def drain():
        while queued:
            method, op = queued.pop(0)
            direct_vm.sender = office.address if method == 'execute' else vault.address
            getattr(vault if method == 'execute' else office, method)(op)
        direct_vm.sender = direct_alice
    registry.clock = clock
    registry.drain = drain
    registry.queued = queued
    actor = identity(direct_alice)
    vault.lock('r', actor, 0, 'r', 0, 'run')
    office.submit_run('r', 'b', OUT_URL, evidence(direct_vm, OUT_URL, OUTPUTS), 'Unverified label', actor)
    return registry, vault, office
