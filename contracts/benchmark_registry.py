# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import hashlib
import json


def locked_json(url: str, expected_hash: str) -> dict:
    response = gl.nondet.web.get(url)
    if response.status != 200:
        raise gl.vm.UserError('[EXTERNAL] Evidence unavailable')
    if len(response.body) > 2_000_000:
        raise gl.vm.UserError('[EXPECTED] Evidence too large')
    if hashlib.sha256(response.body).hexdigest() != expected_hash:
        raise gl.vm.UserError('[EXPECTED] Evidence hash mismatch')
    try:
        result = json.loads(response.body.decode('utf-8'))
    except Exception:
        raise gl.vm.UserError('[EXPECTED] Invalid JSON evidence')
    if not isinstance(result, dict):
        raise gl.vm.UserError('[EXPECTED] Expected a JSON object')
    return result


def validate_dataset(data: dict) -> int:
    items = data.get('items')
    if not isinstance(items, list) or not 1 <= len(items) <= 10000:
        raise gl.vm.UserError('[EXPECTED] Dataset needs 1 to 10000 items')
    seen = set()
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get('id'), str) or not item['id'] or item['id'] in seen:
            raise gl.vm.UserError('[EXPECTED] Item identifiers must be unique')
        if not isinstance(item.get('question'), str) or not item['question']:
            raise gl.vm.UserError('[EXPECTED] Every item needs a question')
        if len(json.dumps(item)) > 24000:
            raise gl.vm.UserError('[EXPECTED] Item too large')
        sources = item.get('sources', [])
        if not isinstance(sources, list) or len(sources) > 3 or any(not isinstance(s, str) or not s.startswith('https://') for s in sources):
            raise gl.vm.UserError('[EXPECTED] At most three HTTPS sources per item')
        seen.add(item['id'])
    return len(items)


class BenchmarkRegistry(gl.Contract):
    benchmarks: TreeMap[str, str]
    order: DynArray[str]

    def __init__(self):
        pass

    @gl.public.write
    def publish(self, benchmark_id: str, name: str, dataset_url: str, content_hash: str, rubric: str,
                sample_size: int, scale: int, tolerance_bps: int, overlap_bps: int) -> None:
        if not benchmark_id or len(benchmark_id) > 80 or benchmark_id in self.benchmarks:
            raise gl.vm.UserError('[EXPECTED] Invalid or existing benchmark identifier')
        if not 1 <= len(name) <= 120 or not 20 <= len(rubric) <= 12000:
            raise gl.vm.UserError('[EXPECTED] Provide a name and a complete rubric')
        if not dataset_url.startswith('https://') or len(dataset_url) > 2048:
            raise gl.vm.UserError('[EXPECTED] Public HTTPS evidence required')
        if len(content_hash) != 64 or any(c not in '0123456789abcdef' for c in content_hash):
            raise gl.vm.UserError('[EXPECTED] SHA256 must be lowercase hexadecimal')
        if not 1 <= sample_size <= 100 or not 1 <= scale <= 100 or not 0 <= tolerance_bps <= 1000 or not 5000 <= overlap_bps <= 10000:
            raise gl.vm.UserError('[EXPECTED] Invalid sampling or comparison rules')
        def verify_evidence():
            return validate_dataset(locked_json(dataset_url, content_hash))
        count = gl.eq_principle.strict_eq(verify_evidence)
        if sample_size > count:
            raise gl.vm.UserError('[EXPECTED] Sample larger than dataset')
        self.benchmarks[benchmark_id] = json.dumps({'id': benchmark_id, 'name': name, 'dataset_url': dataset_url,
            'content_hash': content_hash, 'rubric': rubric, 'sample_size': sample_size, 'scale': scale,
            'tolerance_bps': tolerance_bps, 'overlap_bps': overlap_bps, 'item_count': count,
            'sampling_rule': 'SHA256 ranking without replacement from verified commitment transaction hash',
            'publisher': str(gl.message.sender_address)})
        self.order.append(benchmark_id)

    @gl.public.view
    def get_benchmark(self, benchmark_id: str) -> dict:
        if benchmark_id not in self.benchmarks:
            raise gl.vm.UserError('[EXPECTED] Benchmark not found')
        return json.loads(self.benchmarks[benchmark_id])

    @gl.public.view
    def list_benchmarks(self, offset: int, limit: int) -> list:
        if offset < 0 or not 1 <= limit <= 100:
            raise gl.vm.UserError('[EXPECTED] Invalid page')
        return [json.loads(self.benchmarks[self.order[i]]) for i in range(offset, min(offset + limit, len(self.order)))]

    @gl.public.view
    def count(self) -> int:
        return len(self.order)
