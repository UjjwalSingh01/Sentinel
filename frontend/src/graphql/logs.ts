import { gql } from '@apollo/client/core';

export const GET_LOGS = gql`
  query GetLogs(
    $serverId: String
    $service: String
    $levels: [String!]
    $fromTime: DateTime
    $toTime: DateTime
    $query: String
    $cursor: String
    $limit: Int
  ) {
    logs(
      serverId: $serverId
      service: $service
      levels: $levels
      fromTime: $fromTime
      toTime: $toTime
      query: $query
      cursor: $cursor
      limit: $limit
    ) {
      items {
        time
        serverId
        service
        level
        message
        fields
        traceId
      }
      nextCursor
      hasMore
    }
  }
`;
