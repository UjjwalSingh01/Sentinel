import { gql } from '@apollo/client/core';

export const GET_INCIDENT_TRACES = gql`
  query GetIncidentTraces($incidentId: String!) {
    incidentTraces(incidentId: $incidentId) {
      traceId
      serverId
      rootName
      rootDurationMs
      spans {
        time
        traceId
        spanId
        parentSpanId
        serverId
        service
        name
        durationMs
        status
        attributes
      }
    }
  }
`;

export const GET_INCIDENT_CHILDREN = gql`
  query GetIncidentChildren($parentId: String!) {
    incidentChildren(parentId: $parentId) {
      id
      serverId
      metricType
      severity
      currentValue
      threshold
      message
      status
      createdAt
      ruleId
      ruleName
    }
  }
`;
