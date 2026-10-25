# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json


class BondVault(gl.Contract):
    owner: Address
    office: Address
    configured: bool
    minimum: u256
    balances: TreeMap[str, u256]
    locks: TreeMap[str, str]
    settled: TreeMap[str, bool]

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

    @gl.public.write
    def deposit(self, actor: str) -> None:
        actor = self._actor(actor)
        if gl.message.value == 0:
            raise gl.vm.UserError('[EXPECTED] Positive deposit required')
        self.balances[actor] = u256(self.balances.get(actor, u256(0)) + gl.message.value)

    @gl.public.write
    def lock(self, lock_id: str, actor: str, amount: int) -> None:
        actor = self._actor(actor)
        if not lock_id or len(lock_id) > 100 or lock_id in self.locks or amount < int(self.minimum):
            raise gl.vm.UserError('[EXPECTED] Invalid bond lock')
        available = int(self.balances.get(actor, u256(0)))
        if amount < 0 or available < amount:
            raise gl.vm.UserError('[EXPECTED] Insufficient bond balance')
        self.balances[actor] = u256(available - amount)
        self.locks[lock_id] = json.dumps({'id': lock_id, 'owner': actor, 'amount': amount, 'settled': False})

    @gl.public.write
    def settle(self, run_id: str, challenge_id: str, successful: bool) -> None:
        if not self.configured or gl.message.sender_address != self.office:
            raise gl.vm.UserError('[EXPECTED] Assay office only')
        if challenge_id in self.settled or run_id not in self.locks or challenge_id not in self.locks or run_id == challenge_id:
            raise gl.vm.UserError('[EXPECTED] Invalid or repeated settlement')
        run = json.loads(self.locks[run_id])
        challenge = json.loads(self.locks[challenge_id])
        if run['settled'] or challenge['settled'] or run['owner'] == challenge['owner']:
            raise gl.vm.UserError('[EXPECTED] Bonds unavailable')
        beneficiary = challenge['owner'] if successful else run['owner']
        amount = challenge['amount']
        if successful:
            amount += run['amount']
            run['settled'] = True
            self.locks[run_id] = json.dumps(run)
        challenge['settled'] = True
        self.locks[challenge_id] = json.dumps(challenge)
        self.balances[beneficiary] = u256(int(self.balances.get(beneficiary, u256(0))) + amount)
        self.settled[challenge_id] = True

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
    def get_lock(self, lock_id: str) -> dict:
        if lock_id not in self.locks:
            raise gl.vm.UserError('[EXPECTED] Bond not found')
        return json.loads(self.locks[lock_id])

    @gl.public.view
    def get_balance(self, actor: str) -> int:
        identity = str(Address(actor)) if actor.startswith('0x') and len(actor) == 42 else actor
        return int(self.balances.get(identity, u256(0)))

    @gl.public.view
    def configuration(self) -> dict:
        return {'owner': str(self.owner), 'office': str(self.office) if self.configured else '',
                'configured': self.configured, 'minimum': int(self.minimum), 'asset': 'native',
                'bonding_enabled': self.minimum > 0}
