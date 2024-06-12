import { DefineFunction, Schema } from "deno-slack-sdk/mod.ts";
import { SlackFunction } from "deno-slack-sdk/mod.ts";
import { Env, SlackAPIClient } from "deno-slack-sdk/types.ts";
import { BlockActionInvocationBody } from "deno-slack-sdk/functions/interactivity/types.ts";
import { FunctionRuntimeParameters } from "deno-slack-sdk/functions/types.ts";
import {
  ParameterSetDefinition,
  PossibleParameterKeys,
} from "deno-slack-sdk/parameters/types.ts";
import { DispatchGithubActionsParams } from "../types/dispatch_github_actions.ts";

// 「QA確認OK」ボタンを押下後にデプロイボタンを表示するためのメッセージを投稿する関数
export const PostDeployMessage = DefineFunction({
  callback_id: "post_deploy_message",
  title: "デプロイボタン表示をするメッセージ",
  description:
    "各環境向けにデプロイボタンを表示するためのメッセージを投稿します",
  source_file: "functions/post_deploy_message.ts",
  input_parameters: {
    properties: {
      commitHash: {
        description: "デプロイするコミットのハッシュ",
        type: Schema.types.string,
      },
      githubRepositoryOwner: {
        description: "デプロイ対象のリポジトリのオーナー",
        type: Schema.types.string,
      },
      githubRepository: {
        description: "デプロイ対象のリポジトリ",
        type: Schema.types.string,
      },
      sendToSlackChannelIdStaging: {
        description: "ステージング：Slackに通知するチャンネルID",
        type: Schema.types.string,
      },
      sendToSlackChannelIdProduction: {
        description: "本番：Slackに通知するチャンネルID",
        type: Schema.types.string,
      },
    },
    required: [
      "commitHash",
      "githubRepositoryOwner",
      "githubRepository",
      "sendToSlackChannelIdStaging",
      "sendToSlackChannelIdProduction",
    ],
  },
});

export default SlackFunction(
  PostDeployMessage,
  async ({ inputs, client }) => {
    await postMessage(client, {
      commitHash: inputs.commitHash,
      channel: inputs.sendToSlackChannelIdStaging,
      repository: inputs.githubRepository,
    });
    await postMessage(client, {
      commitHash: inputs.commitHash,
      channel: inputs.sendToSlackChannelIdProduction,
      repository: inputs.githubRepository,
    });
    return { completed: false };
  },
).addBlockActionsHandler(
  new RegExp("-deploy"),
  async ({ action, client, body, env }) => {
    let params: DispatchGithubActionsParams;
    // アクションIDによって設定するパラメータを変更する
    if (
      `${body.function_data.inputs.sendToSlackChannelIdStaging}-deploy` ===
        action.action_id
    ) {
      params = {
        repository: body.function_data.inputs.githubRepository,
        commitHash: body.function_data.inputs.commitHash,
        environment: "staging",
        owner: body.function_data.inputs.githubRepositoryOwner,
      };
    } else if (
      `${body.function_data.inputs.sendToSlackChannelIdProduction}-deploy` ===
        action.action_id
    ) {
      params = {
        repository: body.function_data.inputs.githubRepository,
        commitHash: body.function_data.inputs.commitHash,
        environment: "production",
        owner: body.function_data.inputs.githubRepositoryOwner,
      };
    } else {
      throw new Error("Invalid action_id");
    }

    try {
      const response = await dispatchGithubActions(
        params,
        env,
      );

      if (!response) throw new Error("Failed to dispatch Github Actions");

      await completedDeployMessage(client, body);
      return { completed: true };
    } catch (error) {
      await failedDeployMessage(client, body);
      return { completed: false };
    }
  },
).addBlockActionsHandler(
  new RegExp("-cancel"),
  async ({ client, body }) => {
    await deleteDeployMessage(client, body);
    return { completed: true };
  },
);

/**
 * slackにメッセージを投稿する
 * @param client
 * @param postParams
 */
const postMessage = async (
  client: SlackAPIClient,
  postParams: {
    commitHash: string;
    channel: string;
    repository: string;
  },
) => {
  await client.chat.postMessage({
    channel: postParams.channel,
    blocks: [
      {
        "type": "section",
        "text": {
          "type": "plain_text",
          "text": `コミット：${postParams.commitHash}`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: `🚀デプロイ`,
            },
            action_id: `${postParams.channel}-deploy`,
          },
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: `🚧キャンセル`,
            },
            action_id: `${postParams.channel}-cancel`,
          },
        ],
      },
    ],
  });
};

/**
 * デプロイ完了メッセージに更新する
 * @param client
 * @param body
 */
const completedDeployMessage = async (
  client: SlackAPIClient,
  body: BlockActionInvocationBody<
    FunctionRuntimeParameters<
      ParameterSetDefinition,
      PossibleParameterKeys<ParameterSetDefinition>
    >
  >,
) => {
  // 実行ボタン, キャンセルボタンを抜いたメッセージを取得
  const excludeButtonBlocks = body.message?.blocks.slice(0, -2) ?? [];
  await client.chat.update({
    channel: body.channel?.id,
    ts: body.container.message_ts,
    blocks: [
      ...excludeButtonBlocks,
      {
        type: "section",
        text: {
          type: "plain_text",
          text: `⭕️実行しました`,
        },
      },
    ],
  });
};

/**
 * デプロイ失敗メッセージに更新する
 * @param client
 * @param body
 */
const failedDeployMessage = async (
  client: SlackAPIClient,
  body: BlockActionInvocationBody<
    FunctionRuntimeParameters<
      ParameterSetDefinition,
      PossibleParameterKeys<ParameterSetDefinition>
    >
  >,
) => {
  // 実行ボタン, キャンセルボタンを抜いたメッセージを取得
  const excludeButtonBlocks = body.message?.blocks.slice(0, -2) ?? [];
  await client.chat.update({
    channel: body.channel?.id,
    ts: body.container.message_ts,
    blocks: [
      ...excludeButtonBlocks,
      {
        "type": "section",
        "text": {
          "type": "text",
          "text": `❌エラーが発生したため実行できませんでした`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: `🚀再デプロイ`,
            },
          },
        ],
      },
    ],
  });
};

/**
 * キャンセルボタンを押下した際にデプロイボタンを削除する
 * @param client
 * @param body
 */
const deleteDeployMessage = async (
  client: SlackAPIClient,
  body: BlockActionInvocationBody<
    FunctionRuntimeParameters<
      ParameterSetDefinition,
      PossibleParameterKeys<ParameterSetDefinition>
    >
  >,
) => {
  // 実行ボタン, キャンセルボタンを抜いたメッセージを取得
  const excludeButtonBlocks = body.message?.blocks.slice(0, -2) ?? [];
  await client.chat.update({
    channel: body.channel?.id,
    ts: body.container.message_ts,
    blocks: [
      ...excludeButtonBlocks,
      {
        type: "section",
        text: {
          type: "plain_text",
          text: `🚧キャンセルが押されたのでデプロイボタンが削除されました`,
        },
      },
    ],
  });
};

/**
 * github actionsを実行する
 * ステージング、本番環境のデプロイ処理を実行する
 * @param params
 * @param env
 */
const dispatchGithubActions = async (
  params: DispatchGithubActionsParams,
  env: Env,
) => {
  return await fetch(
    `https://api.github.com/repos/${params.owner}/${params.repository}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify({
        event_type: `${params.environment}`,
        client_payload: {
          commitHash: params.commitHash,
          environment: params.environment,
        },
      }),
    },
  ).then((response) => response.ok)
    .catch((error) => {
      console.error(error);
      throw new Error("Failed to dispatch Github Actions");
    });
};
