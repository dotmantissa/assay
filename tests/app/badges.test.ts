import {beforeEach,expect,it,vi} from "vitest";
const {read}=vi.hoisted(()=>({read:vi.fn()}));
vi.mock("../../lib/chain",()=>({read}));
import {GET} from "../../app/api/badges/[id]/route";
beforeEach(()=>vi.clearAllMocks());
it("suspends the percentage during unresolved challenges and identifies scope",async()=>{
  read.mockResolvedValueOnce({benchmark_id:"b",status:"settling",score_bps:10000,n:4}).mockResolvedValueOnce({id:"b",name:"Demanding <test>",item_count:40});
  const response=await GET(new Request("https://example.org"),{params:Promise.resolve({id:"r"})});
  const svg=await response.text();
  expect(svg).not.toContain("100.0%");
  expect(svg).toContain("settling"); expect(svg).toContain("4/40 items"); expect(svg).toContain("attribution unverified");
  expect(svg).toContain("Demanding &lt;test&gt; [b]");
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("includes the benchmark and full coverage beside a finalized artifact grade",async()=>{
  read.mockResolvedValueOnce({benchmark_id:"b",status:"published",score_bps:7500,n:4}).mockResolvedValueOnce({id:"b",name:"Arithmetic",item_count:4});
  const response=await GET(new Request("https://example.org"),{params:Promise.resolve({id:"r"})});
  const svg=await response.text(); expect(svg).toContain("75.0%"); expect(svg).toContain("Arithmetic [b]"); expect(svg).toContain("4/4 items");
});
