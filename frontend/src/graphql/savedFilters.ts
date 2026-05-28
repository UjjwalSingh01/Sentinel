import { gql } from '@apollo/client/core';

export const GET_SAVED_FILTERS = gql`
  query GetSavedFilters($scope: String) {
    savedFilters(scope: $scope) {
      id
      name
      scope
      filter
      createdAt
    }
  }
`;

export const CREATE_SAVED_FILTER = gql`
  mutation CreateSavedFilter(
    $name: String!
    $scope: String!
    $filter: String!
    $ownerId: String
  ) {
    createSavedFilter(
      name: $name
      scope: $scope
      filter: $filter
      ownerId: $ownerId
    ) {
      id
      name
      scope
      filter
    }
  }
`;

export const DELETE_SAVED_FILTER = gql`
  mutation DeleteSavedFilter($id: String!) {
    deleteSavedFilter(id: $id)
  }
`;
