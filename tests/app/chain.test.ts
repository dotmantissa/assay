import {beforeEach,describe,expect,it,vi} from "vitest";
const {getTransaction,readContract} = vi.hoisted(() => ({getTransaction:vi.fn(),readContract:vi.fn()}));
vi.mock("genlayer-js",()=>({createClient:()=>({getTransaction,readContract})}));
import {read,receipt,TerminalTransactionError} from "../../lib/chain";
import {TransactionHashVariant} from "genlayer-js/types";
describe("Finality boundaries",()=>{
  beforeEach(()=>vi.clearAllMocks());
  it("does not publish accepted execution before finality",async()=>{
    getTransaction.mockResolvedValue({statusName:"ACCEPTED",consensus_data:{leader_receipt:[{execution_result:"SUCCESS"}]}});
    expect(await receipt("hash")).toBeNull();
  });
  it("requires finalized execution success",async()=>{
    getTransaction.mockResolvedValue({statusName:"FINALIZED",consensus_data:{leader_receipt:[{execution_result:"ERROR"}]}});
    await expect(receipt("hash")).rejects.toBeInstanceOf(TerminalTransactionError);
    getTransaction.mockResolvedValue({statusName:"FINALIZED",consensus_data:{leader_receipt:[{execution_result:"SUCCESS"}]}});
    expect(await receipt("hash")).toBeTruthy();
  });
  it("pins all public contract reads to finalized storage",async()=>{
    process.env.GENLAYER_OFFICE_ADDRESS="0x1111111111111111111111111111111111111111";
    readContract.mockResolvedValue({id:"r"});
    await read("office","get_run",["r"]);
    expect(readContract.mock.calls[0][0].transactionHashVariant).toBe(TransactionHashVariant.LATEST_FINAL);
    delete process.env.GENLAYER_OFFICE_ADDRESS;
  });
});
