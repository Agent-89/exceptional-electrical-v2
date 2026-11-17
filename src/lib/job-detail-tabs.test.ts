import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  JOB_DETAIL_TABS,
  adjacentJobDetailTab,
  isJobDetailTabId,
  jobDetailTabFromKey,
  jobDetailTabHref,
  parseJobDetailTab,
  visibleJobDetailPanels,
} from './job-detail-tabs.ts';

const pageSource = readFileSync(
  new URL('../app/hq/jobs/[id]/page.tsx', import.meta.url),
  'utf8',
);
const tabsSource = readFileSync(
  new URL('../app/hq/jobs/[id]/job-detail-tabs.tsx', import.meta.url),
  'utf8',
);
const activitySource = readFileSync(
  new URL('../app/hq/jobs/[id]/job-field-activity.tsx', import.meta.url),
  'utf8',
);
const quotesPanelSource = readFileSync(
  new URL('../app/hq/jobs/[id]/job-quotes-panel.tsx', import.meta.url),
  'utf8',
);
const unlinkButtonSource = readFileSync(
  new URL('../app/hq/jobs/[id]/unlink-job-quote-button.tsx', import.meta.url),
  'utf8',
);

describe('job detail tab registry', () => {
  it('lists the office tabs in navigation order', () => {
    assert.deepEqual(
      JOB_DETAIL_TABS.map((tab) => tab.label),
      ['Overview', 'Notes', 'Visits', 'Time', 'Quotes', 'Invoices', 'Activity', 'More'],
    );
    assert.deepEqual(
      JOB_DETAIL_TABS.map((tab) => tab.id),
      ['overview', 'notes', 'visits', 'time', 'quotes', 'invoices', 'activity', 'more'],
    );
  });

  it('parses direct links and falls back to overview', () => {
    assert.equal(parseJobDetailTab('visits'), 'visits');
    assert.equal(parseJobDetailTab(' TIME '), 'time');
    assert.equal(parseJobDetailTab('Quotes'), 'quotes');
    assert.equal(parseJobDetailTab('notes'), 'notes');
    assert.equal(parseJobDetailTab('Invoices'), 'invoices');
    assert.equal(parseJobDetailTab('activity'), 'activity');
    assert.equal(parseJobDetailTab('costs'), 'overview');
    assert.equal(parseJobDetailTab(null), 'overview');
    assert.equal(parseJobDetailTab(''), 'overview');
    assert.equal(parseJobDetailTab('billing'), 'overview');
    assert.equal(parseJobDetailTab('quotes/edit'), 'overview');
  });

  it('builds a shareable href and omits the query on overview', () => {
    assert.equal(jobDetailTabHref('job-1', 'overview'), '/hq/jobs/job-1');
    assert.equal(jobDetailTabHref('job-1', 'quotes'), '/hq/jobs/job-1?tab=quotes');
    assert.equal(jobDetailTabHref('job-1', 'notes'), '/hq/jobs/job-1?tab=notes');
    assert.equal(isJobDetailTabId('more'), true);
    assert.equal(isJobDetailTabId('invoices'), true);
    assert.equal(isJobDetailTabId('schedule'), false);
  });
});

describe('job detail tab keyboard navigation', () => {
  it('moves horizontally and wraps at the ends', () => {
    assert.equal(jobDetailTabFromKey('overview', 'ArrowLeft'), 'more');
    assert.equal(jobDetailTabFromKey('more', 'ArrowRight'), 'overview');
    assert.equal(jobDetailTabFromKey('overview', 'ArrowRight'), 'notes');
    assert.equal(jobDetailTabFromKey('notes', 'ArrowRight'), 'visits');
    assert.equal(jobDetailTabFromKey('visits', 'ArrowRight'), 'time');
    assert.equal(jobDetailTabFromKey('time', 'ArrowLeft'), 'visits');
    assert.equal(jobDetailTabFromKey('quotes', 'Home'), 'overview');
    assert.equal(jobDetailTabFromKey('overview', 'End'), 'more');
    assert.equal(jobDetailTabFromKey('time', 'ArrowUp'), null);
    assert.equal(jobDetailTabFromKey('time', 'ArrowDown'), null);
    assert.equal(jobDetailTabFromKey('time', 'Enter'), null);
    assert.equal(adjacentJobDetailTab('quotes', 1), 'invoices');
    assert.equal(adjacentJobDetailTab('quotes', -1), 'time');
    assert.equal(adjacentJobDetailTab('invoices', 1), 'activity');
    assert.equal(adjacentJobDetailTab('activity', 1), 'more');
  });

  it('shows only the selected panel', () => {
    for (const tab of JOB_DETAIL_TABS) {
      const visible = visibleJobDetailPanels(tab.id);
      assert.deepEqual(visible, [tab.id]);
      assert.equal(JOB_DETAIL_TABS.length - visible.length, 7);
    }
  });
});

describe('job detail tab shell regression', () => {
  it('switches tabs in place with an accessible tablist', () => {
    assert.match(tabsSource, /role="tablist"/);
    assert.match(tabsSource, /role="tab"/);
    assert.match(tabsSource, /role="tabpanel"/);
    assert.match(tabsSource, /aria-selected=\{selected\}/);
    assert.match(tabsSource, /aria-controls=/);
    assert.match(tabsSource, /hidden=\{item\.id !== tab\}/);
    assert.match(tabsSource, /tabIndex=\{selected \? 0 : -1\}/);
    assert.match(tabsSource, /history\.pushState/);
    assert.doesNotMatch(tabsSource, /router\.(push|replace)/);
    assert.doesNotMatch(tabsSource, /location\.reload/);
    assert.doesNotMatch(pageSource, /className="ee-job-jump"/);
  });

  it('keeps each concern on one tab', () => {
    assert.match(pageSource, /panels=\{\{[\s\S]*overview:/);
    assert.match(pageSource, /notes:/);
    assert.match(pageSource, /visits:/);
    assert.match(pageSource, /invoices:/);
    assert.match(pageSource, /activity:/);
    assert.match(pageSource, /quotes:/);
    assert.doesNotMatch(pageSource, /^\s+costs:/m);
    assert.match(pageSource, /JobQuotesPanel/);
    assert.match(quotesPanelSource, /No quotes linked to this job yet/);
    assert.match(quotesPanelSource, /Make primary/);
    assert.doesNotMatch(quotesPanelSource, /Link existing quote/);
    assert.match(quotesPanelSource, /New quote/);
    assert.match(quotesPanelSource, /New variation/);
    assert.match(quotesPanelSource, /quoteBuilderNewHref/);
    assert.match(quotesPanelSource, /UnlinkJobQuoteButton/);
    assert.match(quotesPanelSource, /A customer is required before creating a quote/);
    assert.match(unlinkButtonSource, /window\.confirm/);
    assert.match(unlinkButtonSource, /confirm_unlink/);
    assert.match(unlinkButtonSource, /unlinkQuoteConfirmMessage/);
    assert.match(activitySource, /No estimated or fabricated figures are\s+shown/);
    assert.match(activitySource, /section === 'visits'/);
    assert.match(activitySource, /section === 'time'/);
    assert.match(activitySource, /section === 'costs'/);
    assert.match(activitySource, /section === 'files'/);
    assert.match(activitySource, /JobTimePanel/);
    assert.match(activitySource, /JobUpdatesPanel/);
    assert.doesNotMatch(activitySource, /showSummary/);
  });

  it('keeps Quotes tab presentation compact on mobile and desktop', () => {
    assert.match(pageSource, /\.ee-section-title \.ee-job-quote-create-actions\{flex:0 1 auto/);
    assert.match(
      pageSource,
      /@media\(max-width:700px\)\{[\s\S]*\.ee-section-title:has\(\.ee-job-quote-create-actions\)/,
    );
    assert.doesNotMatch(quotesPanelSource, /overflow-y:\s*scroll/);
    assert.match(quotesPanelSource, /Open/);
    assert.match(quotesPanelSource, /Preview/);
  });

  it('keeps desktop sticky tabs at the content top without the mobile header offset', () => {
    assert.match(pageSource, /--ee-job-sticky-offset/);
    assert.match(pageSource, /@media\(min-width:1000px\)\{[\s\S]*--ee-job-sticky-offset:0px/);
    assert.match(pageSource, /\.ee-job-tabs\{[\s\S]*position:sticky/);
  });

  it('rotates only the accordion mark and never the summary text', () => {
    const sources = pageSource + activitySource + tabsSource;
    assert.match(
      pageSource,
      /\.ee-expand\[open\]>summary>\.ee-expand-mark\{transform:rotate\(45deg\)\}/,
    );
    assert.doesNotMatch(sources, /\.ee-expand\[open\][^{]*summary\s*\{[^}]*transform/);
    assert.doesNotMatch(sources, /summary\s*\*\s*\{[^}]*rotate/);
    assert.doesNotMatch(sources, /summary\s*\{[^}]*rotate/);
  });
});
