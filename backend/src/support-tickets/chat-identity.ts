// Support chat widget (docs/ROADMAP.md FDP-106) — shared by SupportTicketsService and
// ChatbotService (which resolves this from the request before calling into either). Exactly one
// field is ever set — see SupportTicket's own doc comment for why this isn't just a bare string.
export interface ChatIdentity {
  userId: string | null;
  sessionId: string | null;
}
