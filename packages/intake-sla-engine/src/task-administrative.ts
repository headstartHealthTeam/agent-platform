/** Existing administrative-template exclusions; not a replacement for supported agent adjudication. */
export function isAdministrativeEmail(value = ''): boolean {
  const templateSubject =
    /subject:\s*(welcome to headstart|aba parent assessments|next steps|intake timeline|schedule your|appointment reminder)/i.test(
      value
    );
  const genericTemplate =
    /you will find both links below|view your parent guide|see where you are in the process/i.test(
      value
    );
  const substantiveReply =
    /not received|still waiting|missing|overdue|unable to|could not|responded|replied|declined|cancelled|canceled/i.test(
      value
    );
  return (templateSubject || genericTemplate) && !substantiveReply;
}
export function isAdministrativeTaskReminder(value = ''): boolean {
  const updateRequest =
    /\b(get (?:an )?update on when|follow up (?:on|for) (?:an )?update|overdue sla f\/u)\b/i.test(
      value
    );
  const completedUpdate =
    /\b(?:was|has been|is now|already)\s+(?:submitted|completed|scheduled|approved|denied|rescheduled)\b/i.test(
      value
    );
  if (updateRequest && !completedUpdate) return true;
  const reminder =
    /\b(as a reminder|reminder to complete|please complete .* at your earliest convenience|get (?:an )?update on when|follow up (?:on|for) (?:an )?update|overdue sla f\/u)\b/i.test(
      value
    );
  const newStatus =
    /\b(received|have been completed|were completed|completed on|confirmed complete|submitted|approved|denied|cancelled|canceled|rescheduled|scheduled for|confirmed for)\b/i.test(
      value
    );
  return reminder && !newStatus;
}
