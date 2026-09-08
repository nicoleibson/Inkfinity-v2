import { z } from 'zod';

export const ProcessMappingInputSchema = z.object({
  processDescription: z.string().describe('A natural language description of the business process.'),
});

export const ActivitySchema = z.object({
  id: z.string().describe('Unique identifier for the activity (e.g., "act1").'),
  name: z.string().describe('Name of the activity (e.g., "Revisar solicitud").'),
  role: z.string().optional().describe('Role or actor responsible for the activity (e.g., "Departamento de Ventas").'),
  input: z.string().optional().describe('Documents, data, or resources needed for the activity.'),
  output: z.string().optional().describe('Documents, data, or resources produced by the activity.'),
});

export const DecisionPathSchema = z.object({
  condition: z.string().describe('Condition for this path (e.g., "Sí", "No").'),
  nextActivity: z.string().describe('ID of the next activity or end event (e.g., "act2", "endEvent1").'),
});

export const DecisionSchema = z.object({
  id: z.string().describe('Unique identifier for the decision point (e.g., "dec1").'),
  question: z.string().describe('Question asked at the decision point (e.g., "¿Solicitud aprobada?").'),
  actor: z.string().optional().describe('Actor making the decision.'),
  paths: z.array(DecisionPathSchema).describe('Possible paths based on the decision.'),
});

export const ProcessFlowSchema = z.object({
  from: z.string().describe('Source of the flow (activity ID, decision ID, or "startEvent").'),
  to: z.string().describe('Destination of the flow (activity ID, decision ID, or end event ID).'),
  path: z.string().optional().describe('Condition for the flow if coming from a decision point.'),
});

export const ProcessMappingOutputSchema = z.object({
  processName: z.string().describe('Name of the business process (e.g., "Gestión de Solicitudes").'),
  description: z.string().optional().describe('A brief description of the process.'),
  startEvent: z.string().optional().describe('Description of the event that starts the process.'),
  activities: z.array(ActivitySchema).describe('List of activities in the process.'),
  decisions: z.array(DecisionSchema).describe('List of decision points in the process.'),
  endEvents: z.array(z.string()).describe('List of events that signify the end of a process or sub-process.'),
  flow: z.array(ProcessFlowSchema).describe('Defines the sequence and connections between process components.'),
});
