'use strict';

const assert = require('assert');
const getGrpcGcpObjects = require('../../build/src');

describe('Transformer Tests', () => {
  const grpc = require('@grpc/grpc-js');
  const grpcGcp = getGrpcGcpObjects(grpc);
  const insecureCreds = grpc.credentials.createInsecure();

  it('should use metadata affinity key override and bind on first use', done => {
    const channelOptions = {
      gcpApiConfig: grpcGcp.createGcpApiConfig({
        channelPool: {
          maxSize: 2,
        },
        method: [
          {
            name: ['/TestService/Unary'],
            affinity: {
              command: 'BOUND',
              affinityKey: 'session',
            },
          },
        ],
      }),
    };

    const channelFactory = new grpcGcp.GcpChannelFactory(
      'localhost',
      insecureCreds,
      channelOptions
    );

    // Ensure we have 2 channels
    while (channelFactory.channelRefs.length < 2) {
      channelFactory.addChannel();
    }

    const channelRef1 = channelFactory.channelRefs[0];
    const channelRef2 = channelFactory.channelRefs[1];

    const mockCallProperties = {
      channel: channelFactory,
      argument: { session: 'fallback-key' },
      metadata: new grpc.Metadata(),
      methodDefinition: { path: '/TestService/Unary' },
      callOptions: {},
    };

    // Test 1: No override, fallback to message extraction
    const result1 = grpcGcp.gcpCallInvocationTransformer(mockCallProperties);
    assert(result1.channel === channelRef1.getChannel() || result1.channel === channelRef2.getChannel());

    // Test 2: With override key 'new-key-1'
    mockCallProperties.metadata.set('x-grpc-gcp-affinity-key', 'new-key-1');
    const result2 = grpcGcp.gcpCallInvocationTransformer(mockCallProperties);
    const usedChannel1 = result2.channel;
    
    // Verify it got bound
    assert(channelFactory.isBound('new-key-1'));
    
    // Test 3: Make another call with 'new-key-1', should go to same channel
    const result3 = grpcGcp.gcpCallInvocationTransformer(mockCallProperties);
    assert.strictEqual(result3.channel, usedChannel1);

    // Test 4: With override key 'new-key-2'
    mockCallProperties.metadata.set('x-grpc-gcp-affinity-key', 'new-key-2');
    const result4 = grpcGcp.gcpCallInvocationTransformer(mockCallProperties);
    const usedChannel2 = result4.channel;
    assert(channelFactory.isBound('new-key-2'));

    // Test 5: Make another call with 'new-key-2', should go to same channel
    const result5 = grpcGcp.gcpCallInvocationTransformer(mockCallProperties);
    assert.strictEqual(result5.channel, usedChannel2);

    done();
  });
});
