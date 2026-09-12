"use client";

import { HelpTip } from "@/components/ui/help-tip";

/** One consistent explanatory pattern for engineering panels — Что
 * показывает / Зачем / Как читать / Подробнее — instead of hand-copying
 * the same tooltip markup in every panel. Wraps the existing `HelpTip`
 * trigger/positioning rather than duplicating it.
 *
 * `docsRef` names the durable doc (e.g. "docs/connectivity-margin.md") as
 * plain text, not a clickable link — the frontend doesn't serve repo
 * markdown as a route, so a `<Link>` here would 404 in production. */
export function EngineeringInfo({
  what,
  why,
  howToRead,
  docsRef,
}: {
  what: string;
  why: string;
  howToRead: React.ReactNode;
  docsRef?: string;
}) {
  return (
    <HelpTip>
      <div className="flex flex-col gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            Что показывает
          </p>
          <p>{what}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Зачем</p>
          <p>{why}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            Как читать
          </p>
          <div>{howToRead}</div>
        </div>
        {docsRef && <p className="text-[10px] text-text-muted">Подробнее: {docsRef}</p>}
      </div>
    </HelpTip>
  );
}
