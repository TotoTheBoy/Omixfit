// Renders one legal section with hierarchical numbering: the section is "N.",
// each clause "N.M", and each sub-clause "N.M.K" - shared by the in-app modal
// (Legal.tsx) and the standalone pages (LegalPage.tsx).
type Clause = string | { t: string; sub: string[] };
export interface LegalSectionData {
  h: string;
  clauses: Clause[];
}

export function LegalSection({ n, sec }: { n: number; sec: LegalSectionData }) {
  return (
    <section className="legal-item">
      <h3 className="legal-sec-h">
        <span className="lc-num">{n}.</span>
        {sec.h}
      </h3>
      {sec.clauses.map((c, ci) => {
        const num = `${n}.${ci + 1}`;
        if (typeof c === "string") {
          return (
            <p className="legal-clause" key={ci}>
              <span className="lc-num">{num}</span>
              <span className="lc-txt">{c}</span>
            </p>
          );
        }
        return (
          <div className="legal-clause-group" key={ci}>
            <p className="legal-clause">
              <span className="lc-num">{num}</span>
              <span className="lc-txt">{c.t}</span>
            </p>
            {c.sub.map((s, sj) => (
              <p className="legal-subclause" key={sj}>
                <span className="lc-num">{`${num}.${sj + 1}`}</span>
                <span className="lc-txt">{s}</span>
              </p>
            ))}
          </div>
        );
      })}
    </section>
  );
}
