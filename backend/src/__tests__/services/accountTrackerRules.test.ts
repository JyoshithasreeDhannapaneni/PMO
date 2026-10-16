// Value: protects=the Account Tracker's derived fields (size tier, time-zone windows, connect probability, primary contact,
//   outreach stage, revenue display, HubSpot rich text) match the Sales Tracker rules they were ported from;
//   fails_when=a rule drifts from the Java original (e.g. DST ignored, whole-word title match lost, notes leak markup); why_new=new module; seam=none
import { describe, it, expect } from '@jest/globals';
import {
  bestConnectWindow, choosePrimary, connectProbability, daysSince, htmlToText, isYes, offsetHours, outreachStage,
  parseHubSpotDate, parseNumber, relationshipHealth, revenueDisplay, suggestedCallTime, tierOf, titleCaseEnum, truthy, zoneFor,
} from '../../services/accountTrackerRules';

describe('accountTrackerRules', () => {
  it('parses HubSpot number formats', () => {
    expect(parseNumber('1,200')).toBe(1200);
    expect(parseNumber('$12.5M')).toBe(12_500_000);
    expect(parseNumber('3.4 billion')).toBe(3_400_000_000);
    expect(parseNumber('+5:30')).toBe(5.5);
    expect(parseNumber('n/a')).toBeNull();
  });

  it('title-cases HubSpot enum values, keeping small words lower case', () => {
    expect(titleCaseEnum('INFORMATION_TECHNOLOGY_AND_SERVICES')).toBe('Information Technology and Services');
    expect(titleCaseEnum('  ')).toBeNull();
  });

  it('shows bare revenue numbers compactly and keeps ranges as text', () => {
    expect(revenueDisplay('12500000', 12_500_000)).toBe('$12.5M');
    expect(revenueDisplay('2000000000', 2_000_000_000)).toBe('$2B');
    expect(revenueDisplay('$10M-$50M', 10_000_000)).toBe('$10M-$50M');
  });

  it('derives the size tier from the stated tier, else the employee count', () => {
    expect(tierOf('Enterprise (1000+)', 10)).toBe('Enterprise');
    expect(tierOf(null, 49)).toBe('Small');
    expect(tierOf(null, 50)).toBe('Mid');
    expect(tierOf(null, 500)).toBe('Enterprise');
    expect(tierOf(null, null)).toBeNull();
  });

  it('maps country and state to a DST-aware zone', () => {
    expect(zoneFor('United States', 'CA')).toBe('America/Los_Angeles');
    expect(zoneFor('Canada', 'unknown province')).toBe('America/Toronto');
    expect(zoneFor('Atlantis', null)).toBeNull();
    expect(offsetHours('America/New_York', new Date('2026-07-01T12:00:00Z'))).toBe(-4);
    expect(offsetHours('America/New_York', new Date('2026-01-15T12:00:00Z'))).toBe(-5);
    expect(offsetHours('Asia/Kolkata', new Date('2026-01-15T12:00:00Z'))).toBe(5.5);
  });

  it('expresses their business day in IST and rates the overlap', () => {
    expect(bestConnectWindow(0)).toBe('2:30 PM – 11:30 PM IST');
    expect(suggestedCallTime(0)).toBe('4:00 PM IST');
    expect(connectProbability(1)).toBe('High');
    expect(connectProbability(-4)).toBe('Low');
    expect(connectProbability(null)).toBe('Unknown');
  });

  it('picks the primary contact by title priority with whole-word matches', () => {
    const contacts = [
      { name: 'A', title: 'Executive Assistant to the CEO' },
      { name: 'B', title: 'Director of IT' },
      { name: 'C', title: 'Victor (Sales)' },
    ];
    expect(choosePrimary(contacts)?.name).toBe('B');
    expect(choosePrimary([{ name: 'X', title: 'Advisor' }, { name: 'Y', title: null }])?.name).toBe('X');
    expect(choosePrimary([])).toBeNull();
  });

  it('buckets touches into outreach stages', () => {
    expect(outreachStage(0)).toBe('Cold – First Outreach');
    expect(outreachStage(5)).toBe('Early Stage – Follow Up');
    expect(outreachStage(15)).toBe('Warm – Multiple Touches');
    expect(outreachStage(51)).toBe('Deep Relationship – Nurture / Expand');
  });

  it('reads HubSpot dates and counts days to today', () => {
    expect(parseHubSpotDate('1760486400000')).toBe('2025-10-15');
    expect(parseHubSpotDate('2026-03-31T18:30:00Z')).toBe('2026-03-31');
    expect(daysSince('2026-10-01', '2026-10-15')).toBe(14);
    expect(daysSince('2026-10-20', '2026-10-15')).toBe(0);
  });

  it('turns HubSpot rich text into plain text without markup', () => {
    expect(htmlToText('<p>Hi&nbsp;there</p><ul><li>One</li><li>Two</li></ul><script>x()</script>', 100))
      .toBe('Hi there\n• One\n• Two');
    expect(htmlToText('<p></p>', 100)).toBeNull();
    expect(htmlToText('abcdefghij', 5)).toBe('abcd…');
  });

  it('reads HubSpot yes/no values, including annotated ones', () => {
    expect(truthy('Yes')).toBe(true);
    expect(truthy('1')).toBe(true);
    expect(truthy('no')).toBe(false);
    expect(isYes('Yes - see M&A Watch tab')).toBe(true);
    expect(isYes('yesterday')).toBe(false);
  });

  it('scores relationship health from days since contact', () => {
    expect(relationshipHealth(2, 3).health).toBe('Hot');
    expect(relationshipHealth(10, 3).healthScore).toBe(56);
    expect(relationshipHealth(100, 3).healthScore).toBe(8);
    expect(relationshipHealth(null, 0).health).toBe('Unknown');
  });
});
