import type { SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { DocumentBlockParam, ImageBlockParam } from '@anthropic-ai/sdk/resources';
import { createControllablePromise } from '../../../lib/controllablePromise';

export type UserMessageInput = {
  text: string;
  images?: readonly ImageBlockParam[];
  documents?: readonly DocumentBlockParam[];
};

export type OnMessage = (message: SDKMessage) => void | Promise<void>;

export type GenerateMessages = () => AsyncGenerator<SDKUserMessage, void, unknown>;

export type MessageGenerator = {
  generateMessages: GenerateMessages;
  setNextMessage: (input: UserMessageInput) => void;
  setHooks: (hooks: {
    onNextMessageSet?: (input: UserMessageInput) => void | Promise<void>;
    onNewUserMessageResolved?: (input: UserMessageInput) => void | Promise<void>;
  }) => void;
};

export const createMessageGenerator = (): MessageGenerator => {
  let sendMessagePromise = createControllablePromise<UserMessageInput>();
  let registeredHooks: {
    onNextMessageSet: ((input: UserMessageInput) => void | Promise<void>)[];
    onNewUserMessageResolved: ((input: UserMessageInput) => void | Promise<void>)[];
  } = {
    onNextMessageSet: [],
    onNewUserMessageResolved: [],
  };

  const createMessage = (input: UserMessageInput): SDKUserMessage => {
    const { images = [], documents = [] } = input;

    if (images.length === 0 && documents.length === 0) {
      // eslint-disable-next-line no-unsafe-type-assertion
      return {
        type: 'user',
        message: {
          role: 'user',
          content: input.text,
        },
        parent_tool_use_id: null,
      } satisfies Omit<SDKUserMessage, 'session_id'> as SDKUserMessage;
    }

    // eslint-disable-next-line no-unsafe-type-assertion
    return {
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'text',
            text: input.text,
          },
          ...images,
          ...documents,
        ],
      },
    } as SDKUserMessage;
  };

  // eslint-disable-next-line func-style
  async function* generateMessages(): ReturnType<GenerateMessages> {
    sendMessagePromise = createControllablePromise<UserMessageInput>();

    while (true) {
      const message = await sendMessagePromise.promise;
      sendMessagePromise = createControllablePromise<UserMessageInput>();
      void Promise.allSettled(
        registeredHooks.onNewUserMessageResolved.map((hook) => hook(message)),
      );

      yield createMessage(message);
    }
  }

  const setNextMessage = (input: UserMessageInput) => {
    sendMessagePromise.resolve(input);
    void Promise.allSettled(registeredHooks.onNextMessageSet.map((hook) => hook(input)));
  };

  const setHooks = (hooks: {
    onNextMessageSet?: (input: UserMessageInput) => void | Promise<void>;
    onNewUserMessageResolved?: (input: UserMessageInput) => void | Promise<void>;
  }) => {
    registeredHooks = {
      onNextMessageSet: [
        ...(hooks?.onNextMessageSet ? [hooks.onNextMessageSet] : []),
        ...registeredHooks.onNextMessageSet,
      ],
      onNewUserMessageResolved: [
        ...(hooks?.onNewUserMessageResolved ? [hooks.onNewUserMessageResolved] : []),
        ...registeredHooks.onNewUserMessageResolved,
      ],
    };
  };

  return {
    generateMessages,
    setNextMessage,
    setHooks,
  };
};
