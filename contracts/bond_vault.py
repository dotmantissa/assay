# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import genlayer.py.calldata as calldata
import datetime
import json


def rlp_prefix(base: int, length: int) -> bytes:
    if length < 56:
        return bytes([base + length])
    size = (length.bit_length() + 7) // 8
    return bytes([base + 55 + size]) + length.to_bytes(size, 'big')


def finalized_view(address: Address, method: str, args: list) -> dict:
    # Studio's native cross-contract host rejects LATEST_FINAL storage reads.
    # Validators independently query its finalized RPC snapshot instead of using nonfinal accounting.
    payload = calldata.encode({'method': method, 'args': args})
    encoded = payload if len(payload) == 1 and payload[0] < 128 else rlp_prefix(128, len(payload)) + payload
    body = encoded + b'\x00'
    data = '0x' + (rlp_prefix(192, len(body)) + body).hex()
    def query():
        response = gl.nondet.web.post('https://studio.genlayer.com/api', body=json.dumps({
            'jsonrpc': '2.0', 'id': 1, 'method': 'gen_call', 'params': [{
                'type': 'read', 'to': str(address), 'from': '0x' + '00' * 20,
                'data': data, 'transaction_hash_variant': 'latest-final'}]}).encode(),
            headers={'Content-Type': 'application/json'})
        if response.status != 200 or len(response.body) > 2_000_000:
            raise gl.vm.UserError('[TRANSIENT] Finalized contract RPC unavailable')
        try:
            result = json.loads(response.body.decode()).get('result')
            if isinstance(result, dict):
                if result.get('status', {}).get('code', 0) != 0:
                    raise ValueError('Finalized view failed')
                result = result['data']
            if not isinstance(result, str):
                raise ValueError('Missing finalized result')
            value = calldata.decode(bytes.fromhex(result.removeprefix('0x')))
            if not isinstance(value, dict):
                raise ValueError('Expected contract object')
            return value
        except Exception:
            raise gl.vm.UserError('[TRANSIENT] Finalized contract state unavailable')
    return gl.eq_principle.strict_eq(query)



def now() -> int:
    return int(datetime.datetime.fromisoformat(gl.message_raw['datetime']).timestamp())


class BondVault(gl.Contract):
    owner: Address
    office: Address
    configured: bool
    minimum: u256
    balances: TreeMap[str, u256]
    locks: TreeMap[str, str]
    operations: TreeMap[str, str]

    def __init__(self, minimum: int):
        if minimum < 0:
            raise gl.vm.UserError('[EXPECTED] Negative minimum')
        self.owner = gl.message.sender_address
        self.minimum = u256(minimum)
        self.configured = False

    @gl.public.write
    def configure(self, office: str) -> None:
        if gl.message.sender_address != self.owner or self.configured:
            raise gl.vm.UserError('[EXPECTED] Configuration is owner only and permanent')
        self.office = Address(office)
        self.configured = True

    def _actor(self, actor: str) -> str:
        if not actor or len(actor) > 100:
            raise gl.vm.UserError('[EXPECTED] Invalid account')
        if gl.message.sender_address != self.owner and actor.lower() != str(gl.message.sender_address).lower():
            raise gl.vm.UserError('[EXPECTED] Account not authorized')
        return str(Address(actor)) if actor.startswith('0x') and len(actor) == 42 else actor

    @gl.public.write.payable
    def deposit(self, actor: str) -> None:
        actor = self._actor(actor)
        if gl.message.value == 0:
            raise gl.vm.UserError('[EXPECTED] Positive deposit required')
        self.balances[actor] = u256(self.balances.get(actor, u256(0)) + gl.message.value)

    @gl.public.write
    def lock(self, lock_id: str, actor: str, amount: int, run_id: str, round_number: int, role: str) -> None:
        actor = self._actor(actor)
        if not self.configured or not lock_id or len(lock_id) > 80 or lock_id in self.locks or not run_id or len(run_id) > 80:
            raise gl.vm.UserError('[EXPECTED] Invalid bond lock')
        if role not in ('run', 'challenge') or (role == 'run' and (round_number != 0 or lock_id != run_id)) or (role == 'challenge' and (round_number < 1 or lock_id == run_id)):
            raise gl.vm.UserError('[EXPECTED] Invalid bond purpose')
        available = int(self.balances.get(actor, u256(0)))
        if amount < int(self.minimum) or amount < 0 or available < amount:
            raise gl.vm.UserError('[EXPECTED] Insufficient bond balance')
        self.balances[actor] = u256(available - amount)
        self.locks[lock_id] = json.dumps({'id': lock_id, 'owner': actor, 'amount': amount, 'run_id': run_id,
            'round': round_number, 'role': role, 'expires_at': now() + 86400, 'settled': False, 'operation': ''})

    @gl.public.write
    def execute(self, operation_id: str) -> None:
        if not self.configured or gl.message.sender_address != self.office:
            raise gl.vm.UserError('[EXPECTED] Assay office only')
        # Read the finalized intent. Replays acknowledge the original result without moving funds again.
        if operation_id not in self.operations:
            request = finalized_view(self.office, 'get_operation', [operation_id])
            locks = [self.get_lock(key) for key in request['locks']]
            if not locks or len({b['id'] for b in locks}) != len(locks) or any(b['settled'] for b in locks):
                raise gl.vm.UserError('[EXPECTED] Bonds unavailable')
            if request['kind'] == 'settle':
                if len(locks) != 2:
                    raise gl.vm.UserError('[EXPECTED] Two associated bonds required')
                run, challenge = locks
                if run['id'] != request['run_id'] or run['role'] != 'run' or run['round'] != 0 or challenge['role'] != 'challenge' or challenge['run_id'] != run['id'] or challenge['round'] != request['round'] or run['owner'] == challenge['owner']:
                    raise gl.vm.UserError('[EXPECTED] Bond association mismatch')
                successful = request['successful']
                beneficiary = challenge['owner'] if successful else run['owner']
                amount = challenge['amount'] + (run['amount'] if successful else 0)
                self.balances[beneficiary] = u256(int(self.balances.get(beneficiary, u256(0))) + amount)
                consumed = locks if successful else [challenge]
            elif request['kind'] == 'release':
                if any(b['run_id'] != request['run_id'] for b in locks):
                    raise gl.vm.UserError('[EXPECTED] Bond association mismatch')
                for bond in locks:
                    self.balances[bond['owner']] = u256(int(self.balances.get(bond['owner'], u256(0))) + bond['amount'])
                consumed = locks
            else:
                raise gl.vm.UserError('[EXPECTED] Unknown operation')
            for bond in consumed:
                bond['settled'] = True
                bond['operation'] = operation_id
                self.locks[bond['id']] = json.dumps(bond)
            self.operations[operation_id] = json.dumps(request)
        gl.get_contract_at(self.office).emit(on='finalized').acknowledge(operation_id)

    def _withdraw(self, actor: str, amount: int, recipient: str) -> None:
        available = int(self.balances.get(actor, u256(0)))
        if amount <= 0 or amount > available:
            raise gl.vm.UserError('[EXPECTED] Insufficient withdrawable balance')
        destination = Address(recipient)
        self.balances[actor] = u256(available - amount)
        gl.get_contract_at(destination).emit_transfer(value=u256(amount), on='finalized')

    @gl.public.write
    def withdraw(self, amount: int, recipient: str) -> None:
        self._withdraw(str(gl.message.sender_address), amount, recipient)

    @gl.public.write
    def withdraw_for(self, actor: str, amount: int, recipient: str) -> None:
        self._withdraw(self._actor(actor), amount, recipient)

    @gl.public.view
    def lock_exists(self, lock_id: str) -> bool:
        return lock_id in self.locks

    @gl.public.view
    def get_lock(self, lock_id: str) -> dict:
        if lock_id not in self.locks:
            raise gl.vm.UserError('[EXPECTED] Bond not found')
        return json.loads(self.locks[lock_id])

    @gl.public.view
    def get_operation(self, operation_id: str) -> dict:
        return json.loads(self.operations[operation_id]) if operation_id in self.operations else {}

    @gl.public.view
    def get_balance(self, actor: str) -> int:
        identity = str(Address(actor)) if actor.startswith('0x') and len(actor) == 42 else actor
        return int(self.balances.get(identity, u256(0)))

    @gl.public.view
    def configuration(self) -> dict:
        return {'owner': str(self.owner), 'office': str(self.office) if self.configured else '',
                'configured': self.configured, 'minimum': int(self.minimum), 'asset': 'native',
                'bonding_enabled': self.minimum > 0, 'protocol': 2}
