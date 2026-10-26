from conftest import identity
import pytest
from types import SimpleNamespace


def wire(vault, monkeypatch, requests):
    from genlayer import gl
    emitted = []
    monkeypatch.setattr(gl._cached_gl if hasattr(gl, '_cached_gl') else gl, 'get_contract_at',
        lambda address: SimpleNamespace(view=lambda **kwargs: SimpleNamespace(get_operation=lambda op: requests[op]),
            emit=lambda **kwargs: SimpleNamespace(acknowledge=lambda op: emitted.append((op, kwargs))),
            emit_transfer=lambda **kwargs: emitted.append(kwargs)))
    return emitted


def test_funded_settlement_is_idempotent_and_bound(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, monkeypatch):
    direct_vm.sender = direct_alice
    vault = direct_deploy('contracts/bond_vault.py', 10)
    vault.configure(identity(direct_charlie))
    requests = {'s': {'id': 's', 'kind': 'settle', 'run_id': 'r', 'round': 1, 'locks': ['r', 'c'], 'successful': True}}
    wire(vault, monkeypatch, requests)
    direct_vm.value = 100
    vault.deposit(identity(direct_alice))
    direct_vm.value = 0
    vault.lock('r', identity(direct_alice), 60, 'r', 0, 'run')
    direct_vm.sender = direct_bob
    direct_vm.value = 20
    vault.deposit(identity(direct_bob))
    direct_vm.value = 0
    vault.lock('c', identity(direct_bob), 20, 'r', 1, 'challenge')
    direct_vm.sender = direct_charlie
    vault.execute('s')
    vault.execute('s')
    assert vault.get_balance(identity(direct_bob)) == 80
    assert vault.get_balance(identity(direct_alice)) == 40
    assert vault.get_lock('r')['settled'] and vault.get_lock('c')['settled']


def test_unsuccessful_challenge_then_normal_release(direct_vm, direct_deploy, direct_alice, direct_bob, monkeypatch):
    direct_vm.sender = direct_alice
    vault = direct_deploy('contracts/bond_vault.py', 0)
    vault.configure(identity(direct_alice))
    requests = {'s': {'id': 's', 'kind': 'settle', 'run_id': 'r', 'round': 1, 'locks': ['r', 'c'], 'successful': False},
                'release': {'id': 'release', 'kind': 'release', 'run_id': 'r', 'round': 2, 'locks': ['r']}}
    wire(vault, monkeypatch, requests)
    direct_vm.value = 30
    vault.deposit(identity(direct_alice)); direct_vm.value = 0
    vault.lock('r', identity(direct_alice), 30, 'r', 0, 'run')
    direct_vm.sender = direct_bob; direct_vm.value = 12
    vault.deposit(identity(direct_bob)); direct_vm.value = 0
    vault.lock('c', identity(direct_bob), 12, 'r', 1, 'challenge')
    direct_vm.sender = direct_alice
    vault.execute('s')
    assert vault.get_balance(identity(direct_alice)) == 12
    assert not vault.get_lock('r')['settled']
    vault.execute('release')
    assert vault.get_balance(identity(direct_alice)) == 42
    vault.execute('release')
    assert vault.get_balance(identity(direct_alice)) == 42


def test_vault_authorization_and_lock_checks(direct_vm, direct_deploy, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    vault = direct_deploy('contracts/bond_vault.py', 0)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert('owner'):
        vault.configure(identity(direct_bob))
    with direct_vm.expect_revert('authorized'):
        vault.lock('r', identity(direct_alice), 0, 'r', 0, 'run')
    with direct_vm.expect_revert('office'):
        vault.execute('s')
    with direct_vm.expect_revert('Positive'):
        vault.deposit(identity(direct_bob))
    with direct_vm.expect_revert('Insufficient'):
        vault.withdraw(1, identity(direct_bob))
    direct_vm.sender = direct_alice
    vault.configure(identity(direct_bob))
    with direct_vm.expect_revert('permanent'):
        vault.configure(identity(direct_alice))
    with direct_vm.expect_revert('purpose'):
        vault.lock('c', identity(direct_alice), 0, 'r', 0, 'challenge')
    with direct_vm.expect_revert('Insufficient'):
        vault.lock('r', identity(direct_alice), 1, 'r', 0, 'run')
    vault.lock('r', identity(direct_alice), 0, 'r', 0, 'run')
    with direct_vm.expect_revert('Invalid'):
        vault.lock('r', identity(direct_alice), 0, 'r', 0, 'run')


def test_withdrawal_emits_finalized_transfer(direct_vm, direct_deploy, direct_alice, monkeypatch):
    direct_vm.sender = direct_alice
    vault = direct_deploy('contracts/bond_vault.py', 0)
    emitted = wire(vault, monkeypatch, {})
    direct_vm.value = 50; vault.deposit(identity(direct_alice)); direct_vm.value = 0
    vault.withdraw(20, '0x'+'11'*20)
    assert vault.get_balance(identity(direct_alice)) == 30
    assert emitted[0]['on'] == 'finalized' and emitted[0]['value'] == 20
    with direct_vm.expect_revert('Insufficient'):
        vault.withdraw(31, '0x'+'11'*20)


def test_pinned_sdk_schema_marks_deposit_payable(direct_deploy):
    vault = direct_deploy('contracts/bond_vault.py', 10)
    from genlayer.py.get_schema import get_schema
    schema = get_schema(vault._instance.__class__)
    assert schema['methods']['deposit']['payable'] is True
    assert schema['methods']['lock']['payable'] is False
