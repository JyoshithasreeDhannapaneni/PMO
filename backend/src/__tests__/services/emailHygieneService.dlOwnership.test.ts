import { describe, it, expect } from '@jest/globals';
import { attributeDlMail, computeTeamHygiene, isRemovedFromEmailHygiene, TEAM_DLS, type UserEmailHygiene } from '../../services/emailHygieneService';
import type { TimelineEntry } from '../../services/teamConversationTimeline';

const TEAM1_DL = 'cfmigrationsupport_team1@cloudfuze.com';
const TEAM4_DL = 'cfmigrationsupport_team4@cloudfuze.com';
const HARIKA = { email: 'Harika.Velidi@cloudfuze.com', name: 'Harika' };
const SIVA = { email: 'Siva.Kota@cloudfuze.com', name: 'Siva' };

function customer(addressedTo: string[], recipients = [HARIKA, SIVA]): TimelineEntry {
  return {
    messageId: 'c1', conversationId: 'conv', time: 1, kind: 'customer', text: 'Need help', subject: 'Migration',
    customerEmail: 'it@customer.com', recipients: recipients.map((r) => ({ ...r })), addressedTo,
  };
}

function teamReply(fromAddress: string | undefined): TimelineEntry {
  return {
    messageId: 't1', conversationId: 'conv', time: 2, kind: 'team', text: 'On it', subject: 'RE: Migration',
    teamMemberEmail: SIVA.email, teamMemberName: SIVA.name, fromAddress,
  };
}

describe('emailHygieneService.attributeDlMail', () => {
  it('gives a reply sent from a DL address to the DL, not the member who sent it', () => {
    const reply = teamReply(TEAM1_DL);
    attributeDlMail([{ entries: [reply] }]);
    expect(reply.teamMemberEmail).toBe(TEAM1_DL);
    expect(reply.teamMemberName).toBe('CF Migration Support Team 1 (DL)');
  });

  it('leaves replies sent from a personal address with that person', () => {
    const reply = teamReply(SIVA.email.toLowerCase());
    const noFrom = teamReply(undefined);
    attributeDlMail([{ entries: [reply, noFrom] }]);
    expect(reply.teamMemberEmail).toBe(SIVA.email);
    expect(noFrom.teamMemberEmail).toBe(SIVA.email);
  });

  it('gives a customer email sent to a DL to the DL; members keep it only when addressed directly', () => {
    const msg = customer([TEAM1_DL, 'harika.velidi@cloudfuze.com']);
    attributeDlMail([{ entries: [msg] }]);
    expect(msg.recipients!.map((r) => r.email)).toEqual([HARIKA.email, TEAM1_DL]);
  });

  it('credits every DL a customer email was sent to', () => {
    const msg = customer([TEAM1_DL, TEAM4_DL]);
    attributeDlMail([{ entries: [msg] }]);
    expect(msg.recipients!.map((r) => r.email)).toEqual([TEAM1_DL, TEAM4_DL]);
  });

  it('leaves customer emails not sent to a DL unchanged', () => {
    const msg = customer(['harika.velidi@cloudfuze.com', 'siva.kota@cloudfuze.com']);
    attributeDlMail([{ entries: [msg] }]);
    expect(msg.recipients!.map((r) => r.email)).toEqual([HARIKA.email, SIVA.email]);
  });
});

function fakeUser(email: string, score: number): UserEmailHygiene {
  return { userEmail: email, userName: email.split('@')[0], emailHygieneScore: score } as UserEmailHygiene;
}

describe('emailHygieneService team DLs in team scores', () => {
  it('has one DL per team', () => {
    expect(TEAM_DLS.map((d) => d.email)).toEqual([1, 2, 3, 6, 4, 5].map((n) => `cfmigrationsupport_team${n}@cloudfuze.com`));
  });

  it('counts a DL with mail as a team member, and leaves it out otherwise', () => {
    const rows = computeTeamHygiene([fakeUser(HARIKA.email, 80), fakeUser(TEAM1_DL, 60)]);
    const team1 = rows.find((r) => r.teamId === 'team1')!;
    expect(team1.members.map((m) => m.email)).toContain('cfmigrationsupport_team1@cloudfuze.com');
    expect(team1.teamScore).toBe(70);
    expect(team1.scoredMemberCount).toBe(2);
    const team2 = rows.find((r) => r.teamId === 'team2')!;
    expect(team2.members.some((m) => m.email.startsWith('cfmigrationsupport'))).toBe(false);
  });
});

describe('emailHygieneService.isRemovedFromEmailHygiene', () => {
  it('removes Harshith only from periods ending on or after 2026-10-01', () => {
    expect(isRemovedFromEmailHygiene('Harshith.Kaduluri@cloudfuze.com', '2026-09-30')).toBe(false);
    expect(isRemovedFromEmailHygiene('harshith.kaduluri@cloudfuze.com', '2026-10-01')).toBe(true);
    expect(isRemovedFromEmailHygiene('harshith.kaduluri@cloudfuze.com', '2026-11-15')).toBe(true);
  });

  it('keeps the earlier removals for every period and leaves others alone', () => {
    expect(isRemovedFromEmailHygiene('pallavi.kosuvaripalli@cloudfuze.com', '2026-01-31')).toBe(true);
    expect(isRemovedFromEmailHygiene('harika.velidi@cloudfuze.com', '2026-10-31')).toBe(false);
    expect(isRemovedFromEmailHygiene(null, '2026-10-31')).toBe(false);
  });
});
