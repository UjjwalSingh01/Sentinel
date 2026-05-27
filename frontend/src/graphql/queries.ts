import { gql } from '@apollo/client/core';

export const GET_SERVERS = gql`
  query GetServers {
    servers {
      serverId
      cpu
      memory
      disk
      latencyMs
    }
  }
`;

export const GET_METRICS = gql`
  query GetMetrics($serverId: String!, $fromTime: DateTime, $toTime: DateTime, $bucketMinutes: Int) {
    metrics(serverId: $serverId, fromTime: $fromTime, toTime: $toTime, bucketMinutes: $bucketMinutes) {
      time
      cpu
      memory
      disk
      latencyMs
    }
  }
`;

export const GET_INCIDENTS = gql`
  query GetIncidents($status: String, $serverId: String, $limit: Int) {
    incidents(status: $status, serverId: $serverId, limit: $limit) {
      id
      serverId
      metricType
      severity
      currentValue
      threshold
      message
      status
      aiAnalysis
      assigneeId
      assignee {
        id
        name
        email
      }
      createdAt
      acknowledgedAt
      resolvedAt
      logContext
    }
  }
`;

export const GET_INCIDENT = gql`
  query GetIncident($id: String!) {
    incident(id: $id) {
      id
      serverId
      metricType
      severity
      currentValue
      threshold
      message
      status
      aiAnalysis
      assigneeId
      assignee {
        id
        name
        email
      }
      createdAt
      acknowledgedAt
      resolvedAt
      logContext
    }
  }
`;

export const GET_USERS = gql`
  query GetUsers {
    users {
      id
      name
      email
      role
    }
  }
`;
