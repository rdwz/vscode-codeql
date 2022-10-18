export interface RequestResponse {
  request: {
    url: string,
    method: 'GET' | 'POST',
    body?: any,
  },
  response: {
    status: number,
    body?: any,
  }
}
