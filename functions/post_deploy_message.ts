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
      githubRepository: {
        description: "デプロイ対象のリポジトリ",
        type: Schema.types.string,
      },
      // MEMO: ワークフロービルダーから配列を渡すことができないため、複数のパラメータを受け取る
      githubActionEventTypeStaging: {
        description: "ステージング：Github Actionsを起動させるイベントタイプ",
        type: Schema.types.string,
      },
      sendToSlackChannelIdStaging: {
        description: "ステージング：Slackに通知するチャンネルID",
        type: Schema.types.string,
      },
      githubActionEventTypeProduction: {
        description: "本番：Github Actionsを起動させるイベントタイプ",
        type: Schema.types.string,
      },
      sendToSlackChannelIdProduction: {
        description: "本番：Slackに通知するチャンネルID",
        type: Schema.types.string,
      },
    },
    required: [
      "commitHash",
      "githubRepository",
      "githubActionEventTypeStaging",
      "sendToSlackChannelIdStaging",
      "githubActionEventTypeProduction",
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
      eventType: inputs.githubActionEventTypeStaging,
    });
    await postMessage(client, {
      commitHash: inputs.commitHash,
      channel: inputs.sendToSlackChannelIdProduction,
      repository: inputs.githubRepository,
      eventType: inputs.githubActionEventTypeProduction,
    });
    return { completed: false };
  },
).addBlockActionsHandler(
  new RegExp(".+"),
  async ({ action, client, body, env }) => {
    let params: DispatchGithubActionsParams;
    // アクションIDによって設定するパラメータを変更する
    if (
      body.function_data.inputs.sendToSlackChannelIdStaging === action.action_id
    ) {
      params = {
        repository: body.function_data.inputs.githubRepository,
        eventType: body.function_data.inputs.githubActionEventTypeStaging,
        commitHash: body.function_data.inputs.commitHash,
      };
    } else if (
      body.function_data.inputs.sendToSlackChannelIdProduction ===
        action.action_id
    ) {
      params = {
        repository: body.function_data.inputs.githubRepository,
        eventType: body.function_data.inputs.githubActionEventTypeProduction,
        commitHash: body.function_data.inputs.commitHash,
      };
    } else {
      throw new Error("Invalid action_id");
    }

    try {
      await dispatchGithubActions(
        params,
        env,
      );
      await completedDeployMessage(client, body);
      return { completed: true };
    } catch (error) {
      await failedDeployMessage(client, body);
      return { completed: false };
    }
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
    eventType: string;
  },
) => {
  await client.chat.postMessage({
    channel: postParams.channel,
    blocks: [
      {
        "type": "section",
        "text": {
          "type": "plain_text",
          "text": `コミット：${postParams.commitHash} \n
            リポジトリ：${postParams.repository} \n
            イベントタイプ${postParams.eventType}`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: `🚀Github Actionsを実行する`,
            },
            action_id: postParams.channel,
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
  // 実行ボタンを抜いたメッセージを取得
  const excludeButtonBlocks = body.message?.blocks.slice(0, -1) ?? [];
  await client.chat.update({
    channel: body.channel?.id,
    ts: body.container.message_ts,
    blocks: [
      ...excludeButtonBlocks,
      {
        type: "section",
        text: {
          type: "plain_text",
          text: `⭕️Github Actionsを実行しました`,
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
  // 実行ボタンを抜いたメッセージを取得
  const excludeButtonBlocks = body.message?.blocks.slice(0, -1) ?? [];
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
              text: `🚀Github Actionsを再実行`,
            },
          },
        ],
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
    `https://api.github.com/repos/${env.OWNER}/${params.repository}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify({
        event_type: params.eventType,
        client_payload: {
          commit: params.commitHash,
        },
      }),
    },
  ).then((res) => res.json());
};
