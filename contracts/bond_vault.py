# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import genlayer.py.calldata as calldata
import datetime
import base64
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


@gl.evm.contract_interface
class NativeRecipient:
    class View:
        pass
    class Write:
        pass


class BondVault(gl.Contract):
    owner: Address
    office: Address
    configured: bool
    minimum: u256
    balances: TreeMap[str, u256]
    locks: TreeMap[str, str]
    operations: TreeMap[str, str]
    liability: u256
    withdrawals: TreeMap[str, str]

    def __init__(self, minimum: int):
        if minimum < 0:
            raise gl.vm.UserError('[EXPECTED] Negative minimum')
        self.owner = gl.message.sender_address
        self.minimum = u256(minimum)
        self.configured = False
        self.liability = u256(0)

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
        self.liability = u256(int(self.liability) + int(gl.message.value))

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

    def _withdraw(self, withdrawal_id: str, actor: str, amount: int, recipient: str, method: str, args: list) -> None:
        available = int(self.balances.get(actor, u256(0)))
        if not withdrawal_id or len(withdrawal_id) > 80 or withdrawal_id in self.withdrawals:
            raise gl.vm.UserError('[EXPECTED] Unique withdrawal identifier required')
        if amount <= 0 or amount > available:
            raise gl.vm.UserError('[EXPECTED] Insufficient withdrawable balance')
        if int(self.balance) < amount:
            raise gl.vm.UserError('[EXPECTED] Native funds unavailable')
        destination = Address(recipient)
        self.balances[actor] = u256(available - amount)
        self.withdrawals[withdrawal_id] = json.dumps({'id': withdrawal_id, 'owner': actor, 'amount': amount,
            'recipient': str(destination), 'sender': str(gl.message.sender_address), 'method': method,
            'args': args, 'status': 'pending', 'parent': '', 'child': ''})
        # EOAs require an external native message, not a GenVM __receive__ call.
        NativeRecipient(destination).emit_transfer(value=u256(amount))

    @gl.public.write
    def withdraw(self, withdrawal_id: str, amount: int, recipient: str) -> None:
        self._withdraw(withdrawal_id, str(gl.message.sender_address), amount, recipient,
                       'withdraw', [withdrawal_id, amount, recipient])

    @gl.public.write
    def withdraw_for(self, withdrawal_id: str, actor: str, amount: int, recipient: str) -> None:
        self._withdraw(withdrawal_id, self._actor(actor), amount, recipient,
                       'withdraw_for', [withdrawal_id, actor, amount, recipient])

    @gl.public.view
    def get_withdrawal(self, withdrawal_id: str) -> dict:
        if withdrawal_id not in self.withdrawals:
            raise gl.vm.UserError('[EXPECTED] Withdrawal not found')
        return json.loads(self.withdrawals[withdrawal_id])

    def _withdrawal_proof(self, request: dict, tx_hash: str) -> dict:
        if len(tx_hash) != 66 or not tx_hash.startswith('0x') or any(c not in '0123456789abcdef' for c in tx_hash[2:]):
            raise gl.vm.UserError('[EXPECTED] Invalid withdrawal transaction hash')
        def verify():
            def transaction(identifier):
                response = gl.nondet.web.post('https://studio.genlayer.com/api', body=json.dumps({
                    'jsonrpc': '2.0', 'id': 1, 'method': 'eth_getTransactionByHash', 'params': [identifier]}).encode(),
                    headers={'Content-Type': 'application/json'})
                if response.status != 200 or len(response.body) > 2_000_000:
                    raise gl.vm.UserError('[TRANSIENT] Withdrawal receipt unavailable')
                try:
                    value = json.loads(response.body.decode()).get('result')
                except Exception:
                    raise gl.vm.UserError('[TRANSIENT] Withdrawal receipt unavailable')
                if not isinstance(value, dict):
                    raise gl.vm.UserError('[TRANSIENT] Withdrawal receipt unavailable')
                return value
            parent = transaction(tx_hash)
            receipt = parent.get('consensus_data', {}).get('leader_receipt', [])
            if parent.get('status') != 'FINALIZED':
                raise gl.vm.UserError('[TRANSIENT] Withdrawal parent is not finalized')
            if not receipt or receipt[0].get('execution_result') != 'SUCCESS':
                raise gl.vm.UserError('[EXPECTED] Withdrawal request execution failed')
            try:
                decoded = calldata.decode(base64.b64decode(parent['data']['calldata']))
            except Exception:
                raise gl.vm.UserError('[EXPECTED] Invalid withdrawal calldata')
            if not isinstance(decoded, dict):
                raise gl.vm.UserError('[EXPECTED] Invalid withdrawal calldata')
            names = ['withdrawal_id', 'amount', 'recipient'] if request['method'] == 'withdraw' else ['withdrawal_id', 'actor', 'amount', 'recipient']
            args, kwargs = decoded.get('args', []), decoded.get('kwargs', {})
            if not isinstance(args, list) or not isinstance(kwargs, dict) or len(args) > len(names) or any(k not in names[len(args):] for k in kwargs) or len(args) + len(kwargs) != len(names):
                raise gl.vm.UserError('[EXPECTED] Withdrawal arguments differ')
            committed = args + [kwargs[name] for name in names[len(args):]]
            if str(parent.get('to_address', '')).lower() != str(gl.message.contract_address).lower() or str(parent.get('from_address', '')).lower() != request['sender'].lower() or decoded.get('method') != request['method'] or committed != request['args']:
                raise gl.vm.UserError('[EXPECTED] Transaction does not request this withdrawal')
            def integer(value):
                return int(value, 16) if isinstance(value, str) and value.startswith('0x') else int(value)
            for identifier in parent.get('triggered_transactions', []):
                child = transaction(identifier)
                if integer(child.get('type', -1)) != 0 or child.get('triggered_by') != tx_hash or str(child.get('from_address', '')).lower() != str(gl.message.contract_address).lower() or str(child.get('to_address', '')).lower() != request['recipient'].lower() or integer(child.get('value', 0)) != request['amount']:
                    continue
                if child.get('status') == 'FINALIZED' and child.get('value_credited') is True:
                    return {'status': 'confirmed', 'child': identifier}
                if child.get('status') == 'FINALIZED' and child.get('value_credited') is False:
                    return {'status': 'failed', 'child': identifier}
            return {'status': 'pending', 'child': ''}
        return gl.eq_principle.strict_eq(verify)

    @gl.public.write
    def reconcile_withdrawal(self, withdrawal_id: str, tx_hash: str) -> None:
        request = self.get_withdrawal(withdrawal_id)
        if request['status'] in ('confirmed', 'refunded'):
            return
        proof = self._withdrawal_proof(request, tx_hash)
        request.update(parent=tx_hash, child=proof['child'], status=proof['status'])
        if proof['status'] == 'confirmed':
            self.liability = u256(int(self.liability) - request['amount'])
        elif proof['status'] == 'failed':
            # Pending withdrawals remain liabilities until confirmed delivery or a fully backed refund.
            if int(self.balance) >= int(self.liability):
                self.balances[request['owner']] = u256(int(self.balances.get(request['owner'], u256(0))) + request['amount'])
                request['status'] = 'refunded'
            else:
                request['status'] = 'awaiting_returned_funds'
        self.withdrawals[withdrawal_id] = json.dumps(request)

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
                'bonding_enabled': self.minimum > 0, 'protocol': 2, 'liability': int(self.liability),
                'withdrawals': 'External native transfers; finalized receipt confirmation and backed failure refunds'}
