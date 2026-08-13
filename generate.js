/* ============================================================
   TEST COMPOSER — builds concrete test steps out of the parts
   recovered by the semantic layer (actor / verb / object /
   conditions / quantities / data). Never echoes a bare ID.
   ============================================================ */

/* Lowercase the first letter ONLY when the token is an ordinary common noun.
   Preserves acronyms (JDE, SSO) and multi-word proper nouns (Purchase Request). */
function lower1(s) {
  if (!s) return s;
  const words = s.split(/\s+/);
  const first = words[0];
  if (/^[A-Z0-9]{2,}$/.test(first)) return s;                       // acronym
  if (words.length > 1 && words.slice(1).some(w => /^[A-Z]/.test(w))) return s; // proper phrase
  if (/^[A-Z][a-z]+$/.test(first) && words.length === 1 && /^(Purchase|Contract|Invoice|Order|Request|Payment|Council|Budget)$/.test(first)) return s;
  return first.charAt(0).toLowerCase() + first.slice(1) + (words.length > 1 ? ' ' + words.slice(1).join(' ') : '');
}
function artic(s) {
  if (!s) return s;
  return /^(the|a|an|all|every|each)\b/i.test(s) ? s : 'the ' + s;
}

/* Human-readable restatement of what the requirement demands */
function restate(d, fallback) {
  if (!d.verb && !d.object) return fallback;
  if (!d.verb) return `${d.actor ? d.actor.name : 'The system'} handles ${artic(lower1(d.object))}`;
  if (!d.object) return `${d.actor ? d.actor.name : 'The system'} performs ${d.verb}`;
  const who = d.actor ? d.actor.name : 'the system';
  const neg = d.polarity === 'prohibition' ? 'cannot ' : '';
  return `${who} ${neg}${d.verb} ${artic(lower1(d.object))}`;
}

function normalizeText(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildScenarioContext(req, d, scenario) {
  const parts = [];
  if (scenario && scenario.name) parts.push(`Scenario: ${scenario.name}`);
  if (d.object) parts.push(`Object: ${d.object}`);
  if (d.conditions.length) parts.push(`Condition: ${d.conditions[0].text}`);
  if (d.quantities.length) parts.push(`Threshold: ${d.quantities[0].raw}`);
  if (req && req.text) parts.push(`Requirement: ${req.text.replace(/\s+/g, ' ').slice(0, 160)}`);
  return parts.join(' · ');
}

function findScenarioAnchor(req, scen) {
  if (!scen || !scen.length) return null;
  const text = normalizeText(req && req.text ? req.text : '');
  let best = null;
  scen.forEach(sc => {
    const haystack = normalizeText([sc.name, ...(sc.steps || []), ...(sc.reqs || [])].join(' '));
    let score = 0;
    if (sc.reqs && sc.reqs.includes(req.id)) score += 80;
    const reqTokens = text.split(/\s+/).filter(w => w.length > 3);
    const overlap = reqTokens.filter(t => haystack.includes(t)).length;
    if (overlap) score += overlap * 6;
    if (sc.name && text.includes(normalizeText(sc.name))) score += 12;
    if (score > (best ? best.score : 0)) best = { score, scenario: sc };
  });
  return best ? best.scenario : null;
}

/* Preconditions assembled from actor, conditions and data */
function buildPreconditions(d, req, scenario) {
  const p = [];
  const context = buildScenarioContext(req, d, scenario);
  if (context) p.push(`Use the BRD context: ${context}.`);

  if (d.actor && !/^(system|platform|service|api|integration|scheduler|job)$/i.test(d.actor.name))
    p.push(`${d.actor.name} account exists with the permissions required to ${d.verb || 'perform this action'}.`);
  else
    p.push('The application is running and reachable in the test environment.');

  if (d.object) p.push(`Test data is available for ${artic(lower1(d.object))}.`);

  d.conditions.forEach(c => {
    if (c.kind === 'if' || c.kind === 'when' || c.kind === 'only-if')
      p.push(`Precondition established so that ${c.text}.`);
    if (c.kind === 'after' || c.kind === 'before')
      p.push(`Sequencing controlled so the step occurs ${c.kind} ${c.text}.`);
  });

  if (d.action === 'integrate') p.push('Target system endpoint is reachable and credentials are valid.');
  if (d.action === 'notify') p.push('Recipient contact details are populated and the mail/notification service is enabled.');
  if (d.action === 'authenticate' || d.action === 'authorize') p.push('Both a permitted and a non-permitted account are prepared.');

  return p.join(' ');
}

/* Positive-path steps composed from real content.
   For a prohibition ("shall not"), the primary verification IS the blocked
   attempt, so the flow deliberately drives the disallowed action. */
function buildPositiveSteps(d, req, scenario) {
  const s = [];
  const context = buildScenarioContext(req, d, scenario);
  if (context) s.push(`Execute the BRD scenario using this context: ${context}.`);
  if (d.polarity === 'prohibition') {
    const who = d.actor ? d.actor.name : 'the operator';
    const obj = d.object ? artic(lower1(d.object)) : 'the record';
    if (!/^(system|platform|service|api|integration|scheduler|job)$/i.test(who)) s.push(`Log in as ${who}.`);
    d.conditions.forEach(c => s.push(`Bring the record to the state where the restriction applies (${c.kind} ${c.text}).`));
    s.push(`Attempt to ${d.verb || 'perform the restricted action'} ${obj}.`);
    s.push(`Observe whether the system permits or blocks the attempt.`);
    s.push(`Attempt the same action directly via API/URL to confirm the rule is enforced server-side.`);
    return s;
  }
  const who = d.actor ? d.actor.name : 'the system operator';
  const obj = d.object ? artic(lower1(d.object)) : 'the target record';
  const surface = d.taxonomy ? d.taxonomy.ui : 'the relevant screen';

  if (scenario && scenario.steps && scenario.steps.length) {
    scenario.steps.slice(0, 4).forEach((step, idx) => s.push(`Scenario step ${idx + 1}: ${step}`));
  } else {
    if (d.actor && !/^(system|platform|service|api|integration|scheduler|job)$/i.test(d.actor.name))
      s.push(`Log in as ${who}.`);
  }

  d.conditions.filter(c => ['if', 'when', 'only-if', 'upon'].includes(c.kind))
    .forEach(c => s.push(`Set up the triggering condition: ${c.text}.`));

  switch (d.action) {
    case 'create':
      s.push(`Open ${surface} for ${obj}.`);
      if (d.data.length) s.push(`Populate the required fields: ${d.data.slice(0, 5).join(', ')}.`);
      else s.push(`Populate all mandatory fields with valid values.`);
      s.push(`Save/submit ${obj}.`);
      break;
    case 'read':
      s.push(`Navigate to ${surface} for ${obj}.`);
      s.push(`Observe the values presented on screen.`);
      break;
    case 'update':
      s.push(`Open an existing ${lower1(d.object || 'record')} in ${surface}.`);
      s.push(`Change ${d.data.length ? d.data.slice(0, 3).join(', ') : 'one or more editable fields'} to new valid values.`);
      s.push(`Save the change and reload the record.`);
      break;
    case 'delete':
      s.push(`Locate ${obj} in ${surface}.`);
      s.push(`Execute the ${d.verb} action and confirm the prompt.`);
      break;
    case 'approve':
    case 'reject':
      s.push(`Open ${surface} and select ${obj} awaiting action.`);
      s.push(`Review the submitted details.`);
      s.push(`Select "${d.verb.charAt(0).toUpperCase() + d.verb.slice(1)}"${d.action === 'reject' ? ' and enter a reason' : ''}.`);
      break;
    case 'route':
      s.push(`Advance ${obj} to the point where routing is triggered.`);
      s.push(`Observe which queue/role the item is delivered to.`);
      break;
    case 'validate':
      s.push(`Open ${surface} for ${obj}.`);
      s.push(`Enter values that satisfy the stated rule.`);
      s.push(`Submit and confirm the entry is accepted.`);
      break;
    case 'calculate':
      s.push(`Enter the input values that feed ${obj}.`);
      s.push(`Trigger the calculation.`);
      s.push(`Compare the system result against an independent manual calculation.`);
      break;
    case 'notify':
      s.push(`Perform the action that triggers the notification for ${obj}.`);
      s.push(`Check the recipient's inbox/notification centre.`);
      break;
    case 'integrate':
      s.push(`Trigger the outbound event for ${obj} in the source system.`);
      s.push(`Monitor the interface/middleware log for the transmitted payload.`);
      s.push(`Query the target system for the corresponding record.`);
      break;
    case 'generate':
      s.push(`Provide the source data required for ${obj}.`);
      s.push(`Execute the generation action.`);
      s.push(`Open the produced artifact and inspect its contents.`);
      break;
    case 'export':
      s.push(`Apply the selection criteria for ${obj}.`);
      s.push(`Execute the export and open the downloaded file.`);
      break;
    case 'import':
      s.push(`Prepare a valid source file for ${obj}.`);
      s.push(`Upload the file and run the import.`);
      break;
    case 'search':
      s.push(`Enter search criteria matching known ${lower1(d.object || 'records')}.`);
      s.push(`Execute the search and review the result set.`);
      break;
    case 'store':
      s.push(`Enter and save ${obj}.`);
      s.push(`End the session, log back in, and retrieve the record.`);
      break;
    case 'audit':
      s.push(`Perform the action that must be logged against ${obj}.`);
      s.push(`Open the audit log and locate the resulting entry.`);
      break;
    case 'authenticate':
      s.push(`Enter valid credentials on the login screen.`);
      s.push(`Confirm the session is established and the correct identity is shown.`);
      break;
    case 'authorize':
      s.push(`Attempt the action using a role that is permitted.`);
      s.push(`Repeat using a role that is not permitted.`);
      break;
    case 'encrypt':
      s.push(`Save ${obj} through the application.`);
      s.push(`Inspect the stored value directly in the database/transport layer.`);
      break;
    case 'support':
      s.push(`Configure a load profile matching the stated volume${d.quantities.length ? ' (' + d.quantities[0].raw + ')' : ''}.`);
      s.push(`Execute the load and record throughput and response times.`);
      break;
    case 'schedule':
      s.push(`Confirm the schedule configuration for ${obj}.`);
      s.push(`Wait for (or force) the scheduled execution.`);
      s.push(`Verify the run completed and results were produced.`);
      break;
    case 'classify':
      s.push(`Submit an item that should fall into a known category for ${obj}.`);
      s.push(`Inspect the category assigned by the system.`);
      s.push(`Repeat with an item near a category boundary.`);
      break;
    case 'retain':
      s.push(`Create ${obj} and note its creation date.`);
      s.push(`Advance (or simulate) the system date across the retention period.`);
      s.push(`Attempt to retrieve the record at intervals within the period.`);
      break;
    case 'comply':
      s.push(`Run the applicable conformance check against ${obj}.`);
      s.push(`Record each control that passes and each that fails.`);
      break;
    case 'escalate':
      s.push(`Hold ${obj} in the pre-escalation state until the trigger is reached.`);
      s.push(`Confirm the escalation fires and identify the recipient.`);
      break;
    case 'display':
      s.push(`Navigate to the screen presenting ${obj}.`);
      s.push(`Compare each displayed value against the underlying source record.`);
      break;
    default: {
      // No taxonomy match: still compose from extracted parts, never echo the raw sentence.
      const act = d.verb || 'perform the specified action';
      s.push(`Navigate to the screen or service that handles ${obj}.`);
      s.push(`${act.charAt(0).toUpperCase() + act.slice(1)} ${obj}.`);
      s.push(`Confirm the resulting state of ${obj} matches what the requirement demands.`);
    }
  }

  if (d.compound && d.compound.length)
    s.push(`Repeat for the alternate action(s): ${d.compound.map(c => c.phrase).join(', ')}.`);

  if (d.quantities.length && d.action !== 'support') {
    const q = d.quantities[0];
    s.push(q.type === 'time'
      ? `Record the elapsed time and confirm it stays within ${q.value} ${q.unit}.`
      : `Measure the result against the stated threshold of ${q.value} ${q.unit || ''}`.trim() + '.');
  }

  return s;
}

/* Expected result stated in business terms */
function buildExpected(d, req) {
  const obj = d.object ? artic(lower1(d.object)) : 'the record';
  const base = d.taxonomy ? d.taxonomy.verify
             : (d.verb && d.object ? `${artic(lower1(d.object))} reflects the completed ${d.verb} action`
                                   : 'the resulting state matches the stated intent');
  const parts = [`${base.charAt(0).toUpperCase() + base.slice(1)}`];

  if (d.polarity === 'prohibition')
    parts[0] = `The action on ${obj} is blocked and a clear message explains why`;

  if (d.quantities.length) {
    const q = d.quantities[0];
    parts.push(q.type === 'time'
      ? `Completion occurs within ${q.value} ${q.unit}`
      : q.type === 'capacity'
        ? `The system sustains ${q.value} ${q.unit || 'concurrent users'} without functional or performance degradation`
        : `The measured value respects the ${q.value} ${q.unit || ''} threshold`.replace(/\s+/g, ' ').trim());
  }

  if (d.action === 'approve' || d.action === 'route')
    parts.push(`${obj.charAt(0).toUpperCase() + obj.slice(1)} moves to the correct next stage and the actor is recorded`);

  if (d.action === 'audit' || /audit|log/i.test(req.text))
    parts.push('An audit entry captures actor, action and timestamp');

  return parts.join('. ') + '.';
}

/* Negative-path steps derived from the same content */
function buildNegativeSteps(d, req, scenario) {
  const s = [];
  const who = d.actor ? d.actor.name : 'the operator';
  const obj = d.object ? artic(lower1(d.object)) : 'the record';
  const trigger = d.taxonomy ? d.taxonomy.neg : 'invalid input';
  const context = buildScenarioContext(req, d, scenario);
  if (context) s.push(`Use the BRD scenario context for the negative path: ${context}.`);

  if (d.actor && !/^(system|platform|service|api|integration|scheduler|job)$/i.test(d.actor.name))
    s.push(`Log in as ${who}.`);

  s.push(`Attempt to ${d.verb || 'perform the action'} ${obj} with ${trigger}.`);

  if (d.conditions.length)
    s.push(`Violate the stated condition: negate "${d.conditions[0].text}".`);

  if (d.quantities.length) {
    const q = d.quantities[0];
    const phrase = q.type === 'capacity' ? `exceed the stated capacity of ${q.value} ${q.unit || 'units'}`
                 : q.type === 'time'     ? `allow the elapsed time to exceed ${q.value} ${q.unit}`
                 : q.type === 'lower'    ? `supply a value below the stated minimum of ${q.value} ${q.unit}`
                 :                          `supply a value beyond the stated limit of ${q.value} ${q.unit}`;
    s.push(`Deliberately ${phrase}.`);
  }

  s.push('Submit the action and observe the system response.');
  s.push('Re-query the record to confirm nothing was partially committed.');
  return s;
}

function buildNegativeExpected(d) {
  const obj = d.object ? artic(lower1(d.object)) : 'the record';
  return `The action is rejected with a specific, user-readable validation message. ` +
         `${obj.charAt(0).toUpperCase() + obj.slice(1)} remains unchanged and no partial data is committed. ` +
         `The failed attempt is logged.`;
}

if (false)
  module.exports = { buildPreconditions, buildPositiveSteps, buildExpected,
                     buildNegativeSteps, buildNegativeExpected, restate, artic, lower1 };

