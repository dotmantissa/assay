import type { Grade } from "@/lib/types";
export function Fingerprint({ grades = [] }: { grades?: Grade[] }) {
  return (
    <div
      className="fingerprint"
      role="img"
      aria-label={
        grades.length
          ? `${grades.filter((g) => !g.incorrect).length} correct and ${grades.filter((g) => g.incorrect).length} incorrect graded answers`
          : "No graded answers yet"
      }
    >
      {grades.length
        ? grades.map((g) => (
            <span
              key={g.id}
              className={g.incorrect ? "cell incorrect" : "cell correct"}
              title={`Item ${g.id}: ${g.score}. ${g.reason}`}
            />
          ))
        : Array.from({ length: 48 }, (_, i) => (
            <span className="cell empty" key={i} />
          ))}
    </div>
  );
}
