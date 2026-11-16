'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  JOB_DETAIL_TABS,
  isJobDetailTabId,
  jobDetailTabFromKey,
  parseJobDetailTab,
  type JobDetailTabId,
} from '@/lib/job-detail-tabs';

const SelectTabContext = createContext<(tab: JobDetailTabId) => void>(() => {});

export function JobTabButton({
  tab,
  className,
  children,
}: {
  tab: JobDetailTabId;
  className?: string;
  children: ReactNode;
}) {
  const select = useContext(SelectTabContext);
  return (
    <button type="button" className={className ?? 'ee-text-action'} onClick={() => select(tab)}>
      {children}
    </button>
  );
}

function tabDomId(baseId: string, tab: JobDetailTabId): string {
  return `${baseId}-${tab}-tab`;
}

function panelDomId(baseId: string, tab: JobDetailTabId): string {
  return `${baseId}-${tab}-panel`;
}

function tabFromLocation(): JobDetailTabId {
  const params = new URLSearchParams(window.location.search);
  const query = params.get('tab');
  if (query) return parseJobDetailTab(query);
  const hash = window.location.hash.replace(/^#/, '').toLowerCase();
  return isJobDetailTabId(hash) ? hash : 'overview';
}

export default function JobDetailTabs({
  initialTab,
  panels,
}: {
  initialTab: JobDetailTabId;
  panels: Record<JobDetailTabId, ReactNode>;
}) {
  const [tab, setTab] = useState<JobDetailTabId>(initialTab);
  const baseId = useId();
  const skipPanelScroll = useRef(true);

  const writeUrl = useCallback((next: JobDetailTabId, mode: 'push' | 'replace') => {
    const url = new URL(window.location.href);
    if (next === 'overview') url.searchParams.delete('tab');
    else url.searchParams.set('tab', next);
    url.hash = '';
    const nextHref = `${url.pathname}${url.search}`;
    const currentHref = `${window.location.pathname}${window.location.search}`;
    if (nextHref === currentHref && !window.location.hash) return;
    const historyState = { jobDetailTab: next };
    if (mode === 'push') window.history.pushState(historyState, '', nextHref);
    else window.history.replaceState(historyState, '', nextHref);
  }, []);

  const select = useCallback(
    (next: JobDetailTabId) => {
      setTab(next);
      writeUrl(next, 'push');
    },
    [writeUrl],
  );

  useEffect(() => {
    const next = tabFromLocation();
    setTab(next);
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash.replace(/^#/, '').toLowerCase();
    if (!params.get('tab') && isJobDetailTabId(hash)) writeUrl(next, 'replace');
  }, [initialTab, writeUrl]);

  useEffect(() => {
    const onPop = () => setTab(tabFromLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const tabButton = document.getElementById(tabDomId(baseId, tab));
    tabButton?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    if (skipPanelScroll.current) {
      skipPanelScroll.current = false;
      return;
    }
    // Keep the job header visible and the sticky tab bar aligned after ?tab= changes.
    requestAnimationFrame(() => {
      document.querySelector('.ee-workspace-head')?.scrollIntoView({ block: 'start' });
      tabButton?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    });
  }, [baseId, tab]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = jobDetailTabFromKey(tab, event.key);
    if (!next) return;
    event.preventDefault();
    if (next !== tab) select(next);
    document.getElementById(tabDomId(baseId, next))?.focus();
  }

  return (
    <SelectTabContext.Provider value={select}>
      <div
        className="ee-job-tabs"
        role="tablist"
        aria-label="Job sections"
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
      >
        {JOB_DETAIL_TABS.map((item) => {
          const selected = item.id === tab;
          return (
            <button
              key={item.id}
              id={tabDomId(baseId, item.id)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelDomId(baseId, item.id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => {
                if (item.id !== tab) select(item.id);
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {JOB_DETAIL_TABS.map((item) => {
        const selected = item.id === tab;
        return (
          <div
            key={item.id}
            id={panelDomId(baseId, item.id)}
            className="ee-job-panel"
            role="tabpanel"
            aria-labelledby={tabDomId(baseId, item.id)}
            hidden={item.id !== tab}
            tabIndex={selected ? 0 : undefined}
          >
            {panels[item.id]}
          </div>
        );
      })}
    </SelectTabContext.Provider>
  );
}
