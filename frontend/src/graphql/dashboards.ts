import { gql } from '@apollo/client/core';

export const GET_DASHBOARDS = gql`
  query GetDashboards {
    dashboards {
      id
      name
      ownerId
      layout
      isDefault
      updatedAt
    }
  }
`;

export const GET_DASHBOARD = gql`
  query GetDashboard($id: String!) {
    dashboard(id: $id) {
      id
      name
      ownerId
      layout
      isDefault
      updatedAt
    }
  }
`;

export const CREATE_DASHBOARD = gql`
  mutation CreateDashboard($name: String!, $layout: String, $ownerId: String) {
    createDashboard(name: $name, layout: $layout, ownerId: $ownerId) {
      id
      name
      layout
    }
  }
`;

export const UPDATE_DASHBOARD = gql`
  mutation UpdateDashboard($id: String!, $name: String, $layout: String) {
    updateDashboard(id: $id, name: $name, layout: $layout) {
      id
      name
      layout
      updatedAt
    }
  }
`;

export const DELETE_DASHBOARD = gql`
  mutation DeleteDashboard($id: String!) {
    deleteDashboard(id: $id)
  }
`;
