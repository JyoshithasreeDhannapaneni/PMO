import { describe, it, expect } from '@jest/globals';
import { computeTeamHygiene, computeSegmentHeads, type UserEmailHygiene } from '../../services/emailHygieneService';

function fakeUser(email: string, score: number): UserEmailHygiene {
  return {
    userEmail: email,
    userName: email.split('@')[0],
    uniqueCustomerThreads: 1,
    avgFirstReplyTimeHours: 1,
    slaHitRate: 100,
    avgFullResolutionTimeHours: 1,
    relevancyScore: 1,
    relevancySample: null,
    accuracyRate: 100,
    completenessRate: 100,
    oneReplyResolutionRate: 100,
    reopenedThreadRate: 0,
    toneScore: 20,
    speedScore: 30,
    qualityScore: 30,
    resolutionScore: 20,
    emailHygieneScore: score,
    insights: [],
    bestWorst: {
      speed: { best: null, worst: null },
      quality: { best: null, worst: null },
      resolution: { best: null, worst: null },
      tone: { best: null, worst: null },
    },
    scoreBreakdown: { speed: [], quality: [], resolution: [], tone: [] },
  };
}

describe('emailHygieneService.computeTeamHygiene', () => {
  it('produces exactly 6 team rows from the real roster', () => {
    const rows = computeTeamHygiene([]);
    expect(rows).toHaveLength(6);
    expect(rows.map(r => r.teamId)).toEqual(['team1', 'team2', 'team3', 'team4', 'team5', 'team6']);
  });

  it('returns null teamScore and zero scoredMemberCount when no members have individual scores yet', () => {
    const rows = computeTeamHygiene([]);
    for (const row of rows) {
      expect(row.teamScore).toBeNull();
      expect(row.scoredMemberCount).toBe(0);
      expect(row.memberCount).toBeGreaterThan(0);
    }
  });

  it('averages only the members that have a computed score, ignoring team members with none', () => {
    // team1 = Harika.Velidi (manager), Siva.Kota, Ravi.Hemanth, Meena.Lakshmi
    const results = [
      fakeUser('Harika.Velidi@cloudfuze.com', 80),
      fakeUser('Siva.Kota@cloudfuze.com', 60),
      // Ravi.Hemanth and Meena.Lakshmi have no individual score this cycle
    ];
    const rows = computeTeamHygiene(results);
    const team1 = rows.find(r => r.teamId === 'team1')!;
    expect(team1.teamScore).toBe(70); // (80+60)/2, not divided by 4
    expect(team1.scoredMemberCount).toBe(2);
    expect(team1.memberCount).toBe(4);
  });

  it('includes the manager in the average, not just direct reports', () => {
    const results = [
      fakeUser('Harika.Velidi@cloudfuze.com', 100), // manager
      fakeUser('Siva.Kota@cloudfuze.com', 0),
      fakeUser('Ravi.Hemanth@cloudfuze.com', 0),
      fakeUser('Meena.Lakshmi@cloudfuze.com', 0),
    ];
    const rows = computeTeamHygiene(results);
    const team1 = rows.find(r => r.teamId === 'team1')!;
    // If the manager were excluded this would be 0 — proves the manager counts too.
    expect(team1.teamScore).toBe(25);
  });

  it('assigns team4 and team6 to ENT, all others to SMB', () => {
    const rows = computeTeamHygiene([]);
    const bySegment = Object.fromEntries(rows.map(r => [r.teamId, r.segment]));
    expect(bySegment).toEqual({
      team1: 'SMB', team2: 'SMB', team3: 'SMB',
      team4: 'ENT', team5: 'SMB', team6: 'ENT',
    });
  });

  it('includes harshith.kaduluri in team4 alongside the other 5 members', () => {
    const rows = computeTeamHygiene([]);
    const team4 = rows.find(r => r.teamId === 'team4')!;
    expect(team4.memberCount).toBe(6);
    expect(team4.members.map(m => m.email.toLowerCase())).toContain('harshith.kaduluri@cloudfuze.com');
  });

  it('resolves a member\'s display name from their individual result when available', () => {
    const results = [fakeUser('Pranavi@cloudfuze.com', 90)];
    // fakeUser sets userName to the email's local part; verify that's what gets used
    const rows = computeTeamHygiene(results);
    const team6 = rows.find(r => r.teamId === 'team6')!;
    const managerMember = team6.members.find(m => m.email.toLowerCase() === 'pranavi@cloudfuze.com');
    expect(managerMember?.name).toBe('Pranavi');
    expect(managerMember?.score).toBe(90);
  });
});

describe('emailHygieneService.computeSegmentHeads', () => {
  it("computes Abhishek's (ENT) score as the average of team4 and team6, not his own mailbox score", () => {
    const teamHygiene = computeTeamHygiene([
      // team4 members
      fakeUser('Lakshmi.Prasanna@cloudfuze.com', 80), fakeUser('Chaitanya.Gupta@cloudfuze.com', 80),
      fakeUser('Davidraj.Dumpala@cloudfuze.com', 80), fakeUser('harshith.kaduluri@cloudfuze.com', 80),
      fakeUser('LakshmaReddy@cloudfuze.com', 80), fakeUser('Ganesh.Kondameedi@cloudfuze.com', 80),
      // team6 members
      fakeUser('Pranavi@cloudfuze.com', 60), fakeUser('chandra.mouli@cloudfuze.com', 60),
      fakeUser('Arun@cloudfuze.com', 60), fakeUser('Manoj.Bathula@cloudfuze.com', 60),
      fakeUser('Pallavi.Kosuvaripalli@cloudfuze.com', 60),
      // Abhishek's own individual score — deliberately very different, must NOT affect his segment score
      fakeUser('Abhishek.Sakala@cloudfuze.com', 5),
    ]);
    const heads = computeSegmentHeads(teamHygiene);
    expect(heads.ENT.score).toBe(70); // (80 + 60) / 2 — team4 and team6 averaged, not his own 5
    expect(heads.ENT.teamIds).toEqual(['team4', 'team6']);
  });

  it("computes Ajay's (SMB) score as the average of teams 1, 2, 3, and 5", () => {
    const teamHygiene = computeTeamHygiene([]); // no individual scores at all yet
    const heads = computeSegmentHeads(teamHygiene);
    expect(heads.SMB.teamIds).toEqual(['team1', 'team2', 'team3', 'team5']);
    expect(heads.SMB.score).toBeNull(); // no team has a score yet, so the segment average is null too
  });

  it('excludes unscored teams from the segment average rather than treating them as 0', () => {
    // Only team1 has any scored members; team2, team3, team5 have none.
    const teamHygiene = computeTeamHygiene([
      fakeUser('Harika.Velidi@cloudfuze.com', 100), fakeUser('Siva.Kota@cloudfuze.com', 100),
      fakeUser('Ravi.Hemanth@cloudfuze.com', 100), fakeUser('Meena.Lakshmi@cloudfuze.com', 100),
    ]);
    const heads = computeSegmentHeads(teamHygiene);
    expect(heads.SMB.score).toBe(100); // only team1 contributes; team2/3/5 excluded, not averaged in as 0
  });
});
