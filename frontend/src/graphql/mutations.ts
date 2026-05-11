import { gql } from '@apollo/client/core';

export const ACKNOWLEDGE_INCIDENT = gql`
  mutation AcknowledgeIncident($id: String!) {
    acknowledgeIncident(id: $id) {
      id
      status
      acknowledgedAt
    }
  }
`;

export const RESOLVE_INCIDENT = gql`
  mutation ResolveIncident($id: String!) {
    resolveIncident(id: $id) {
      id
      status
      resolvedAt
    }
  }
`;

export const ASSIGN_INCIDENT = gql`
  mutation AssignIncident($id: String!, $userId: String!) {
    assignIncident(id: $id, userId: $userId) {
      id
      assigneeId
      assignee {
        id
        name
        email
      }
    }
  }
`;

export const REQUEST_AI_ANALYSIS = gql`
  mutation RequestAiAnalysis($id: String!) {
    requestAiAnalysis(id: $id) {
      incidentId
      analysis
      cached
    }
  }
`;
