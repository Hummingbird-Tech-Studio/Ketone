/**
 * Domain types for authentication
 */

export interface User {
  id: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SignupRequest {
  email: string;
  password: string;
}

export interface SignupResponse {
  user: User;
}
