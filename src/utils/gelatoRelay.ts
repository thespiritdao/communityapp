import { GelatoRelay, type TaskState, type TransactionStatusResponse } from '@gelatonetwork/relay-sdk';

export class GelatoRelayManager {
  private relay: GelatoRelay;
  private static instance: GelatoRelayManager;

  private constructor() {
    this.relay = new GelatoRelay();
    this.setupWebSocket();
  }

  static getInstance(): GelatoRelayManager {
    if (!GelatoRelayManager.instance) {
      GelatoRelayManager.instance = new GelatoRelayManager();
    }
    return GelatoRelayManager.instance;
  }

  private setupWebSocket() {
    const ws = new WebSocket('wss://api.gelato.digital/tasks/ws/status');

    ws.onopen = () => {
      console.log('🔹 Gelato WebSocket connected');
    };

    ws.onerror = (error) => {
      console.error('❌ Gelato WebSocket error:', error);
    };
  }

  async sponsoredCall(
    contractAddress: string,
    data: string,
    onStatusUpdate?: (status: TaskState) => void,
  ) {
    try {
      const request = {
        chainId: 8453n, // Base
        target: contractAddress,
        data: data,
        user: process.env.NEXT_PUBLIC_SAFE_WALLET!,
      };

      const response = await this.relay.sponsoredCall(
        request,
        process.env.GELATO_API_KEY!,
      );

      if (onStatusUpdate) {
        this.subscribeToTaskStatus(response.taskId, onStatusUpdate);
      }

      return response;
    } catch (error) {
      console.error('❌ Gelato sponsored call failed:', error);
      throw error;
    }
  }

  private subscribeToTaskStatus(
    taskId: string,
    onStatusUpdate: (status: TaskState) => void,
  ) {
    const ws = new WebSocket('wss://api.gelato.digital/tasks/ws/status');

    ws.onopen = () => {
      ws.send(JSON.stringify({ taskId }));
    };

    ws.onmessage = (event) => {
      const status = JSON.parse(event.data) as TaskState;
      onStatusUpdate(status);
    };

    ws.onerror = (error) => {
      console.error('❌ Task status WebSocket error:', error);
    };
  }

  async getTaskStatus(taskId: string): Promise<TransactionStatusResponse | undefined> {
    return await this.relay.getTaskStatus(taskId);
  }
}
