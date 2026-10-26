import {beforeEach, describe, expect, it, vi} from "vitest";
const {sql, read, write, receipt, resumeBroadcast} = vi.hoisted(() => ({sql:Object.assign(vi.fn(), {transaction:vi.fn()}),read:vi.fn(),write:vi.fn(),receipt:vi.fn(),resumeBroadcast:vi.fn()}));
vi.mock("../../lib/db", () => ({db:() => sql}));
vi.mock("../../lib/chain", () => ({read,write,receipt,resumeBroadcast,TerminalTransactionError:class TerminalTransactionError extends Error {}}));
import {TerminalTransactionError} from "../../lib/chain";
import {processNext,pollingDelay,waitingExpired,syncRecords} from "../../lib/jobs";
const job = {id:"job",owner_id:"owner",kind:"submit",result_id:"job",payload:{},step:3,tx_hash:"hash",signed_tx:"signed",broadcast_hash:"root",transactions:[],poll_count:0,tx_started_at:new Date().toISOString()};
function queries() {return sql.mock.calls.map(([strings]) => strings.join("?")).join("\n");}
describe("Queue progress and transaction recovery", () => {
  beforeEach(() => {vi.clearAllMocks();sql.mockResolvedValue([]);sql.mockResolvedValueOnce([{token:"held"}]).mockResolvedValueOnce([{...job}]);});
  it("backs off a pending receipt and allows other ready jobs to be selected", async () => {
    receipt.mockResolvedValue(null);
    await processNext();
    expect(queries()).toContain("next_poll_at<=now()");
    expect(queries()).toContain("ORDER BY next_poll_at,updated_at,created_at");
    expect(sql.mock.calls[2][1]).toBe("working");
    expect(sql.mock.calls[2]).toContain(8);
    expect(write).not.toHaveBeenCalled();
  });
  it("discards only a terminally rejected broadcast so a retry can sign afresh", async () => {
    receipt.mockRejectedValue(new TerminalTransactionError("Rejected"));
    await processNext();
    expect(queries()).toContain("failed_transactions=failed_transactions");
    expect(queries()).toContain("tx_hash=NULL,signed_tx=NULL,broadcast_hash=NULL,tx_started_at=NULL");
    expect(sql.mock.calls.flat()).toContain("execution");
  });
  it("keeps the signed broadcast after a temporary polling error", async () => {
    receipt.mockRejectedValue(new Error("RPC unavailable"));
    await processNext();
    expect(queries()).not.toContain("failed_transactions=failed_transactions");
    expect(sql.mock.calls.flat()).toContain("transport");
  });
  it("requires a deadline for unbounded receipt waits", () => {
    expect(waitingExpired(new Date(Date.now()-86400000).toISOString())).toBe(true);
    expect(waitingExpired(null)).toBe(false);
    expect([0,1,2,3,8].map(pollingDelay)).toEqual([8,16,32,64,120]);
  });
  it("reconciles a recorded grade before signing the next grade on retry", async () => {
    sql.mockReset().mockResolvedValue([]).mockResolvedValueOnce([{token:"held"}]).mockResolvedValueOnce([{...job,tx_hash:null,signed_tx:null,broadcast_hash:null,tx_started_at:null}]);
    read.mockResolvedValueOnce({id:"job",status:"grading",deadline:Date.now()/1000+86400,round_count:1})
      .mockResolvedValueOnce({status:"grading",sample:[0,1],grades:[{id:"0",score:1}]});
    write.mockResolvedValue("new");
    await processNext();
    expect(write.mock.calls[0].slice(0,3)).toEqual(["office","grade_item",["job",1]]);
  });
  it("repairs the office after a vault operation finalized without acknowledgement", async () => {
    sql.mockReset().mockResolvedValue([]).mockResolvedValueOnce([{token:"held"}]).mockResolvedValueOnce([{...job,tx_hash:null,signed_tx:null,broadcast_hash:null,tx_started_at:null}]);
    read.mockResolvedValueOnce({id:"job",status:"settling",pending_operation:"operation"}).mockResolvedValueOnce({id:"operation"});
    write.mockResolvedValue("new");
    await processNext();
    expect(write.mock.calls[0].slice(0,3)).toEqual(["office","reconcile_settlement",["operation"]]);
  });
});
describe("Finalized index reconciliation", () => {
  beforeEach(() => {vi.clearAllMocks();sql.mockResolvedValue([]);Object.assign(sql,{transaction:vi.fn().mockResolvedValue([])});});
  it("replaces stale records only after the full finalized snapshot was read", async () => {
    read.mockResolvedValueOnce(1).mockResolvedValueOnce([{id:"b"}]).mockResolvedValueOnce({run_count:0});
    await syncRecords();
    expect(sql.transaction).toHaveBeenCalledTimes(1);
    expect(queries()).toContain("DELETE FROM public_records");
    expect(sql.mock.calls.flat().join()).toContain('"finality":"finalized"');
  });
  it("leaves the old index intact when snapshot reads fail", async () => {
    read.mockRejectedValueOnce(new Error("unavailable"));
    await expect(syncRecords()).rejects.toThrow("unavailable");
    expect(sql.transaction).not.toHaveBeenCalled();
    expect(queries()).not.toContain("DELETE FROM public_records");
  });
});
