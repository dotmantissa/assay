import pytest

def test_funding_lock_and_slash(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    direct_vm.sender = direct_alice
    vault = direct_deploy('contracts/bond_vault.py', 10)
    vault.configure(('0x' + direct_charlie.hex()))
    direct_vm.value = 100
    vault.deposit(('0x' + direct_alice.hex()))
    direct_vm.value = 0
    vault.lock('r', ('0x' + direct_alice.hex()), 60)
    assert vault.get_balance(('0x' + direct_alice.hex())) == 40
    direct_vm.sender = direct_bob
    direct_vm.value = 20
    vault.deposit(('0x' + direct_bob.hex()))
    direct_vm.value = 0
    vault.lock('c',('0x' + direct_bob.hex()),20)
    direct_vm.sender = direct_charlie
    vault.settle('r','c',True)
    assert vault.get_balance(('0x' + direct_bob.hex())) == 80
    assert vault.get_lock('r')['settled']
    with direct_vm.expect_revert('repeated'):
        vault.settle('r','c',True)

def test_failed_challenge_returns_challenge_bond(direct_vm, direct_deploy, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    vault = direct_deploy('contracts/bond_vault.py', 0)
    vault.configure(('0x' + direct_alice.hex()))
    vault.lock('r',('0x' + direct_alice.hex()),0)
    direct_vm.sender = direct_bob
    direct_vm.value = 12
    vault.deposit(('0x' + direct_bob.hex()))
    direct_vm.value = 0
    vault.lock('c',('0x' + direct_bob.hex()),12)
    direct_vm.sender = direct_alice
    vault.settle('r','c',False)
    assert vault.get_balance(('0x' + direct_alice.hex())) == 12
    assert not vault.get_lock('r')['settled']

def test_vault_authorization(direct_vm, direct_deploy, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    vault = direct_deploy('contracts/bond_vault.py',0)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert('owner'):
        vault.configure(('0x' + direct_bob.hex()))
    with direct_vm.expect_revert('authorized'):
        vault.lock('r',('0x' + direct_alice.hex()),0)
    with direct_vm.expect_revert('office'):
        vault.settle('r','c',True)
    with direct_vm.expect_revert('Positive'):
        vault.deposit(('0x' + direct_bob.hex()))
    with direct_vm.expect_revert('Insufficient'):
        vault.withdraw(1,('0x' + direct_bob.hex()))
    direct_vm.sender = direct_alice
    vault.configure(('0x' + direct_bob.hex()))
    with direct_vm.expect_revert('permanent'):
        vault.configure(('0x' + direct_alice.hex()))

def test_cannot_overdraw_or_reuse_lock(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    vault = direct_deploy('contracts/bond_vault.py',0)
    with direct_vm.expect_revert('Insufficient'):
        vault.lock('r',('0x' + direct_alice.hex()),1)
    vault.lock('r',('0x' + direct_alice.hex()),0)
    with direct_vm.expect_revert('Invalid'):
        vault.lock('r',('0x' + direct_alice.hex()),0)
