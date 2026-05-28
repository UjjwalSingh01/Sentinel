import { gql } from '@apollo/client/core';

export const GET_ALERT_RULES = gql`
  query GetAlertRules {
    alertRules {
      id
      name
      type
      severity
      expression
      enabled
      runbookUrl
      createdBy
      createdAt
      updatedAt
    }
  }
`;

export const CREATE_RULE = gql`
  mutation CreateRule(
    $name: String!
    $type: String!
    $severity: String!
    $expression: String!
    $enabled: Boolean
    $runbookUrl: String
  ) {
    createRule(
      name: $name
      type: $type
      severity: $severity
      expression: $expression
      enabled: $enabled
      runbookUrl: $runbookUrl
    ) {
      id
      name
      type
      severity
      expression
      enabled
      updatedAt
    }
  }
`;

export const UPDATE_RULE = gql`
  mutation UpdateRule(
    $id: String!
    $name: String
    $severity: String
    $expression: String
    $runbookUrl: String
  ) {
    updateRule(
      id: $id
      name: $name
      severity: $severity
      expression: $expression
      runbookUrl: $runbookUrl
    ) {
      id
      name
      severity
      expression
      updatedAt
    }
  }
`;

export const TOGGLE_RULE = gql`
  mutation ToggleRule($id: String!, $enabled: Boolean!) {
    toggleRule(id: $id, enabled: $enabled) {
      id
      enabled
    }
  }
`;

export const DELETE_RULE = gql`
  mutation DeleteRule($id: String!) {
    deleteRule(id: $id)
  }
`;
