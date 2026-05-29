import { gql } from '@apollo/client/core';

export const GET_ON_CALL_SCHEDULE = gql`
  query GetOnCallSchedule {
    onCallSchedule {
      id
      userId
      startsAt
      endsAt
      user {
        id
        name
        email
      }
    }
    currentOnCall {
      id
      userId
      user {
        id
        name
        email
      }
      startsAt
      endsAt
    }
  }
`;

export const GET_NOTIFICATION_LOG = gql`
  query GetNotificationLog($incidentId: String, $limit: Int) {
    notificationLog(incidentId: $incidentId, limit: $limit) {
      id
      incidentId
      channel
      recipient
      template
      sentAt
      payload
    }
  }
`;

export const CREATE_ON_CALL_ENTRY = gql`
  mutation CreateOnCallEntry(
    $userId: String!
    $startsAt: DateTime!
    $endsAt: DateTime!
  ) {
    createOnCallEntry(userId: $userId, startsAt: $startsAt, endsAt: $endsAt) {
      id
      userId
      startsAt
      endsAt
    }
  }
`;

export const DELETE_ON_CALL_ENTRY = gql`
  mutation DeleteOnCallEntry($id: String!) {
    deleteOnCallEntry(id: $id)
  }
`;
