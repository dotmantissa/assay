import pytest
from conftest import DATA, URL, evidence

def test_publication_is_immutable_and_paginated(direct_vm, direct_deploy):
    registry = direct_deploy('contracts/benchmark_registry.py')
    digest = evidence(direct_vm, URL, DATA)
    args = ['b', 'Arithmetic', URL, digest, 'Correct answer earns exactly one point.', 8, 1, 0, 10000]
    registry.publish(*args)
    assert registry.count() == 1
    assert registry.get_benchmark('b')['content_hash'] == digest
    assert registry.list_benchmarks(0, 10)[0]['item_count'] == 8
    assert registry.list_benchmarks(1, 10) == []
    with direct_vm.expect_revert('existing'):
        registry.publish(*args)

@pytest.mark.parametrize('index,value', [(2,'http://example.org'),(3,'a'),(4,'short'),(5,0),(5,9),(6,0),(7,1001),(8,4999)])
def test_invalid_registration(direct_vm, direct_deploy, index, value):
    registry = direct_deploy('contracts/benchmark_registry.py')
    args = ['b', 'Arithmetic', URL, evidence(direct_vm, URL, DATA), 'Correct answer earns exactly one point.', 8, 1, 0, 10000]
    args[index] = value
    with direct_vm.expect_revert():
        registry.publish(*args)

def test_tampered_dataset_and_duplicate_ids(direct_vm, direct_deploy):
    registry = direct_deploy('contracts/benchmark_registry.py')
    evidence(direct_vm, URL, DATA)
    with direct_vm.expect_revert('hash mismatch'):
        registry.publish('b','Math',URL,'0'*64,'Correct answer earns exactly one point.',2,1,0,10000)
    bad = {'items': [DATA['items'][0], DATA['items'][0]]}
    digest = evidence(direct_vm, 'https://example.org/bad', bad)
    with direct_vm.expect_revert('unique'):
        registry.publish('b','Math','https://example.org/bad',digest,'Correct answer earns exactly one point.',2,1,0,10000)


def test_live_sources_require_immutable_snapshots(direct_vm, direct_deploy):
    import hashlib
    registry = direct_deploy('contracts/benchmark_registry.py')
    source = {'url': 'https://example.org/live', 'text': 'Fact as of yesterday.', 'sha256': hashlib.sha256(b'Fact as of yesterday.').hexdigest(), 'as_of': '2026-10-25T00:00:00Z'}
    args = ['b', 'Snapshots', URL, '', 'Grade against committed facts at as_of.', 1, 1, 0, 10000]
    for invalid in ('https://example.org/live', dict(source, sha256='0'*64), dict(source, as_of='yesterday')):
        direct_vm.clear_mocks()
        args[3] = evidence(direct_vm, URL, {'items': [{'id': 'q', 'question': 'Fact?', 'sources': [invalid]}]})
        with direct_vm.expect_revert():
            registry.publish(*args)
    direct_vm.clear_mocks()
    args[3] = evidence(direct_vm, URL, {'items': [{'id': 'q', 'question': 'Fact?', 'sources': [source]}]})
    registry.publish(*args)
    assert registry.get_benchmark('b')['protocol'] == 2
