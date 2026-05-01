-- 012_forum_templates_v2.sql
-- Replace legacy forum templates with 7 new templates matching current app state.
-- Templates use HTML content format (matching Tiptap editor output).
-- Run in Supabase SQL editor.

BEGIN;

-- Remove old templates
DELETE FROM forum_templates
WHERE id IN ('election', 'ep-month', 'ep-report', 'funding', 'metagov', 'pod-creation', 'rfp');

-- 1. General Discussion
INSERT INTO forum_templates (id, name, title_template, content_template, placeholders)
VALUES (
  'general-discussion',
  'General Discussion',
  '{topic_title}',
  '<h2>Discussion Topic</h2>
<p>{topic_title}</p>
<p>{content}</p>',
  '[
    {"id": "topic_title", "type": "text", "label": "Topic Title", "helpText": "A clear, engaging title for your discussion", "required": true, "width": "full", "group": "basic"},
    {"id": "content", "type": "textarea", "label": "Your Thoughts", "helpText": "Share what you want to discuss. What question, idea, or observation do you want the community to engage with?", "required": true, "width": "full", "group": "basic"}
  ]'::jsonb
);

-- 2. Pod Proposal Discussion
INSERT INTO forum_templates (id, name, title_template, content_template, placeholders)
VALUES (
  'pod-proposal',
  'Pod Proposal Discussion',
  'Proposal: {proposal_title}',
  '<h2>Proposal: {proposal_title}</h2>
<p><strong>Pod:</strong> {pod_name}</p>
<p><strong>Author(s):</strong> {author_tags}</p>
<hr>
<h3>Summary</h3>
<p>{summary}</p>
<h3>Rationale</h3>
<p>{rationale}</p>
<h3>Objectives</h3>
<p>{objectives}</p>
<h3>Timeline</h3>
<p>{timeline}</p>
<hr>
<p><em>Per SpiritDAO process, forum discussion is required before formal proposal submission. Please share your feedback, questions, and suggestions below.</em></p>',
  '[
    {"id": "proposal_title", "type": "text", "label": "Proposal Title", "helpText": "A clear title for your proposal", "required": true, "width": "full", "group": "basic"},
    {"id": "pod_name", "type": "text", "label": "Pod Name", "helpText": "Which pod is this proposal for?", "required": true, "width": "half", "group": "basic"},
    {"id": "author_tags", "type": "text", "label": "Author(s)", "helpText": "@mention the proposal authors", "required": true, "width": "half", "group": "basic"},
    {"id": "summary", "type": "textarea", "label": "Summary", "helpText": "Summarize your proposal in 2-3 sentences (280 chars max recommended)", "required": true, "width": "full", "group": "details", "validation": "maxLength:500"},
    {"id": "rationale", "type": "textarea", "label": "Rationale", "helpText": "Why is this proposal needed? What problem does it solve or opportunity does it create?", "required": true, "width": "full", "group": "details"},
    {"id": "objectives", "type": "textarea", "label": "Objectives", "helpText": "What specific outcomes will this proposal deliver?", "required": true, "width": "full", "group": "details"},
    {"id": "timeline", "type": "text", "label": "Timeline", "helpText": "Estimated timeline for completion", "required": false, "width": "full", "group": "details"}
  ]'::jsonb
);

-- 3. Funding Request
INSERT INTO forum_templates (id, name, title_template, content_template, placeholders)
VALUES (
  'funding-request',
  'Funding Request',
  '[Funding] {proposal_title}',
  '<h2>Funding Request: {proposal_title}</h2>
<p><strong>Requesting Pod/Team:</strong> {requesting_pod}</p>
<p><strong>Author(s):</strong> {team}</p>
<hr>
<h3>Amount Requested</h3>
<ul>
<li><strong>$SYSTEM:</strong> {amount_system}</li>
<li><strong>$SELF:</strong> {amount_self}</li>
</ul>
<h3>Purpose</h3>
<p>{purpose}</p>
<h3>Deliverables</h3>
<p>{deliverables}</p>
<h3>Timeline</h3>
<p>{timeline}</p>
<hr>
<p><em>Funding proposals require community discussion before on-chain submission. Please provide feedback below.</em></p>',
  '[
    {"id": "proposal_title", "type": "text", "label": "Proposal Title", "helpText": "Title for your funding request", "required": true, "width": "full", "group": "basic"},
    {"id": "requesting_pod", "type": "text", "label": "Requesting Pod/Team", "helpText": "Which pod or team is requesting funding?", "required": true, "width": "half", "group": "basic"},
    {"id": "team", "type": "text", "label": "Team Members", "helpText": "@mention team members responsible", "required": true, "width": "half", "group": "basic"},
    {"id": "amount_system", "type": "text", "label": "$SYSTEM Amount", "helpText": "Amount of $SYSTEM tokens requested", "required": true, "width": "half", "group": "funding"},
    {"id": "amount_self", "type": "text", "label": "$SELF Amount", "helpText": "Amount of $SELF tokens requested (if any)", "required": false, "width": "half", "group": "funding"},
    {"id": "purpose", "type": "textarea", "label": "Purpose", "helpText": "What will the funding be used for? Provide a clear breakdown.", "required": true, "width": "full", "group": "details"},
    {"id": "deliverables", "type": "textarea", "label": "Deliverables", "helpText": "What specific deliverables will result from this funding?", "required": true, "width": "full", "group": "details"},
    {"id": "timeline", "type": "text", "label": "Timeline", "helpText": "When do you expect to deliver?", "required": false, "width": "full", "group": "details"}
  ]'::jsonb
);

-- 4. Governance Proposal
INSERT INTO forum_templates (id, name, title_template, content_template, placeholders)
VALUES (
  'governance-proposal',
  'Governance Proposal',
  '[Governance] {proposal_title}',
  '<h2>Governance Proposal: {proposal_title}</h2>
<p><strong>Type:</strong> {proposal_type}</p>
<p><strong>Author(s):</strong> {authors}</p>
<p><strong>Voting Period:</strong> {voting_period}</p>
<hr>
<h3>Summary</h3>
<p>{summary}</p>
<h3>Description</h3>
<p>{description}</p>
<h3>Rationale</h3>
<p>{rationale}</p>
<h3>Expected Impact</h3>
<p>{impact}</p>
<hr>
<p><em>Governance proposals require structured deliberation in the forum before formal on-chain submission. Share your position, concerns, and suggestions below.</em></p>',
  '[
    {"id": "proposal_title", "type": "text", "label": "Proposal Title", "helpText": "A clear, descriptive title for this governance proposal", "required": true, "width": "full", "group": "basic"},
    {"id": "proposal_type", "type": "select", "label": "Proposal Type", "helpText": "Select the governance tier", "required": true, "width": "half", "group": "basic", "options": ["Constitutional (DAO-wide on-chain)", "Treasury Binding (Pod treasury)", "Operational (Pod coordination)"]},
    {"id": "authors", "type": "text", "label": "Author(s)", "helpText": "@mention the proposal authors", "required": true, "width": "half", "group": "basic"},
    {"id": "voting_period", "type": "text", "label": "Proposed Voting Period", "helpText": "When should voting open and close?", "required": false, "width": "full", "group": "basic"},
    {"id": "summary", "type": "textarea", "label": "Summary", "helpText": "Summarize the proposal in 2-3 sentences", "required": true, "width": "full", "group": "details", "validation": "maxLength:500"},
    {"id": "description", "type": "textarea", "label": "Full Description", "helpText": "Provide the detailed proposal description, including any rule or process changes", "required": true, "width": "full", "group": "details"},
    {"id": "rationale", "type": "textarea", "label": "Rationale", "helpText": "Why is this change needed? What problem does it address?", "required": true, "width": "full", "group": "details"},
    {"id": "impact", "type": "textarea", "label": "Expected Impact", "helpText": "How will this affect DAO members, pods, or operations?", "required": true, "width": "full", "group": "details"}
  ]'::jsonb
);

-- 5. Request for Help / RFP
INSERT INTO forum_templates (id, name, title_template, content_template, placeholders)
VALUES (
  'request-for-help',
  'Request for Help / RFP',
  '[Help Wanted] {request_title}',
  '<h2>{request_title}</h2>
<p><strong>Type:</strong> {request_type}</p>
<p><strong>Contact:</strong> {contact}</p>
<hr>
<h3>What We Need</h3>
<p>{description}</p>
<h3>Skills / Expertise Needed</h3>
<p>{skills_needed}</p>
<h3>Timeline</h3>
<p>{timeline}</p>
<hr>
<p><em>Interested? Reply below or reach out to the contact listed above. Bounties may be available for qualified contributors.</em></p>',
  '[
    {"id": "request_title", "type": "text", "label": "Request Title", "helpText": "What are you looking for?", "required": true, "width": "full", "group": "basic"},
    {"id": "request_type", "type": "select", "label": "Request Type", "helpText": "What kind of help do you need?", "required": true, "width": "half", "group": "basic", "options": ["Bounty", "Volunteer", "RFP (Request for Proposals)", "Collaboration"]},
    {"id": "contact", "type": "text", "label": "Point of Contact", "helpText": "@mention who to reach out to", "required": true, "width": "half", "group": "basic"},
    {"id": "description", "type": "textarea", "label": "Description", "helpText": "Describe what you need in detail. Be specific about scope and expectations.", "required": true, "width": "full", "group": "details"},
    {"id": "skills_needed", "type": "textarea", "label": "Skills / Expertise Needed", "helpText": "What skills, experience, or tools should contributors have?", "required": true, "width": "full", "group": "details"},
    {"id": "timeline", "type": "text", "label": "Timeline", "helpText": "When do you need this completed?", "required": false, "width": "full", "group": "details"}
  ]'::jsonb
);

-- 6. Event Proposal
INSERT INTO forum_templates (id, name, title_template, content_template, placeholders)
VALUES (
  'event-proposal',
  'Event Proposal',
  '[Event] {event_title}',
  '<h2>Event Proposal: {event_title}</h2>
<p><strong>Type:</strong> {event_type}</p>
<p><strong>Facilitator:</strong> {facilitator}</p>
<hr>
<h3>Description</h3>
<p>{description}</p>
<h3>Logistics</h3>
<ul>
<li><strong>Date/Time:</strong> {date_time}</li>
<li><strong>Duration:</strong> {duration}</li>
<li><strong>Max Participants:</strong> {max_participants}</li>
</ul>
<hr>
<p><em>Interested in attending? Reply below. Event details will be finalized based on community interest and feedback.</em></p>',
  '[
    {"id": "event_title", "type": "text", "label": "Event Title", "helpText": "Name your event", "required": true, "width": "full", "group": "basic"},
    {"id": "event_type", "type": "select", "label": "Event Type", "helpText": "What kind of event is this?", "required": true, "width": "half", "group": "basic", "options": ["Workshop", "Discussion", "Practice Session", "Social", "Other"]},
    {"id": "facilitator", "type": "text", "label": "Facilitator", "helpText": "@mention who will lead this event", "required": true, "width": "half", "group": "basic"},
    {"id": "description", "type": "textarea", "label": "Description", "helpText": "What will happen at this event? What should participants expect?", "required": true, "width": "full", "group": "details"},
    {"id": "date_time", "type": "text", "label": "Date & Time", "helpText": "Proposed date and time (include timezone)", "required": true, "width": "half", "group": "logistics"},
    {"id": "duration", "type": "text", "label": "Duration", "helpText": "How long will the event last?", "required": true, "width": "half", "group": "logistics"},
    {"id": "max_participants", "type": "text", "label": "Max Participants", "helpText": "Maximum number of participants (leave blank for unlimited)", "required": false, "width": "half", "group": "logistics"}
  ]'::jsonb
);

-- 7. Reflection / Practice Share
INSERT INTO forum_templates (id, name, title_template, content_template, placeholders)
VALUES (
  'reflection-share',
  'Reflection / Practice Share',
  '{title}',
  '<h2>{title}</h2>
<p><strong>Type:</strong> {reflection_type}</p>
<hr>
<p>{content}</p>',
  '[
    {"id": "title", "type": "text", "label": "Title", "helpText": "Give your reflection a title", "required": true, "width": "full", "group": "basic"},
    {"id": "reflection_type", "type": "select", "label": "Type", "helpText": "What kind of share is this?", "required": true, "width": "full", "group": "basic", "options": ["Practice Report", "Book Discussion", "Insight", "Question"]},
    {"id": "content", "type": "textarea", "label": "Your Reflection", "helpText": "Share your experience, insight, question, or observation. This is a space for authentic exploration.", "required": true, "width": "full", "group": "basic"}
  ]'::jsonb
);

COMMIT;
