import type {
  ChatMessageDto,
  ChatPart,
  Citation,
  ConfirmationCard,
  ConversationDetail,
  ConversationDto,
} from '@stockroom/shared';
import type { Prisma } from '#generated/prisma/client.ts';
import type { Db } from '../db/client';
import { toJson } from '../db/json';
import { type Actor, assertCan } from '../domain/actor';
import { forbidden, notFound } from '../domain/errors';

export const NEW_CHAT_TITLE = 'New chat';

interface StoredParts {
  parts: ChatPart[];
  citations: Citation[];
  ruleBased: boolean;
}

const userOf = (actor: Actor) => {
  if (actor.type !== 'user') throw forbidden('Only signed-in people can use the Assistant.');
  return actor.userId;
};

/** Assistant conversations. Each person sees only their own. */
export class ChatService {
  constructor(private readonly prisma: Db) {}

  private message(m: Prisma.ChatMessageGetPayload<object>): ChatMessageDto {
    const stored = (m.parts as StoredParts | null) ?? { parts: [], citations: [], ruleBased: false };
    return {
      id: m.id,
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
      parts: stored.parts ?? [],
      citations: stored.citations ?? [],
      modelUsed: m.modelUsed,
      runId: m.runId,
      ruleBased: stored.ruleBased ?? false,
      createdAt: m.createdAt.toISOString(),
    };
  }

  private async own(actor: Actor, id: string) {
    const userId = userOf(actor);
    const c = await this.prisma.chatConversation.findUnique({ where: { id } });
    if (!c || c.userId !== userId) throw notFound('Conversation');
    return c;
  }

  async list(actor: Actor): Promise<ConversationDto[]> {
    assertCan(actor, 'inventory.view');
    const rows = await this.prisma.chatConversation.findMany({
      where: { userId: userOf(actor) },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: { _count: { select: { messages: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      messageCount: c._count.messages,
    }));
  }

  async get(actor: Actor, id: string): Promise<ConversationDetail> {
    const c = await this.own(actor, id);
    const messages = await this.prisma.chatMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
    });
    return {
      id: c.id,
      title: c.title,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      messageCount: messages.length,
      messages: messages.map((m) => this.message(m)),
    };
  }

  async summary(actor: Actor, id: string): Promise<ConversationDto> {
    const c = await this.own(actor, id);
    const count = await this.prisma.chatMessage.count({ where: { conversationId: id } });
    return {
      id: c.id,
      title: c.title,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      messageCount: count,
    };
  }

  async create(actor: Actor, title = NEW_CHAT_TITLE): Promise<ConversationDto> {
    assertCan(actor, 'inventory.view');
    const c = await this.prisma.chatConversation.create({ data: { userId: userOf(actor), title } });
    return {
      id: c.id,
      title: c.title,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      messageCount: 0,
    };
  }

  async rename(actor: Actor, id: string, title: string): Promise<ConversationDto> {
    await this.own(actor, id);
    await this.prisma.chatConversation.update({ where: { id }, data: { title } });
    return this.summary(actor, id);
  }

  async remove(actor: Actor, id: string): Promise<void> {
    await this.own(actor, id);
    await this.prisma.chatConversation.delete({ where: { id } });
  }

  /** The last turns as plain text, for the model's context. */
  async history(
    actor: Actor,
    id: string,
    limit = 12,
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    await this.own(actor, id);
    const rows = await this.prisma.chatMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { role: true, content: true },
    });
    return rows
      .reverse()
      .map((r) => ({ role: r.role === 'user' ? 'user' : 'assistant', content: r.content }));
  }

  async addMessage(
    actor: Actor,
    conversationId: string,
    m: {
      role: 'user' | 'assistant';
      content: string;
      parts?: ChatPart[];
      citations?: Citation[];
      ruleBased?: boolean;
      runId?: string | null;
      modelUsed?: string | null;
    },
  ): Promise<ChatMessageDto> {
    const c = await this.own(actor, conversationId);
    const row = await this.prisma.chatMessage.create({
      data: {
        conversationId,
        role: m.role,
        content: m.content,
        parts: toJson({
          parts: m.parts ?? [],
          citations: m.citations ?? [],
          ruleBased: m.ruleBased ?? false,
        }),
        runId: m.runId ?? null,
        modelUsed: m.modelUsed ?? null,
      },
    });
    // The first question names the conversation.
    const title =
      c.title === NEW_CHAT_TITLE && m.role === 'user'
        ? m.content.replace(/\s+/g, ' ').trim().slice(0, 60) + (m.content.length > 60 ? '…' : '')
        : undefined;
    await this.prisma.chatConversation.update({
      where: { id: conversationId },
      data: { title, updatedAt: new Date() },
    });
    return this.message(row);
  }

  async card(actor: Actor, messageId: string, cardId: string) {
    const m = await this.prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!m) throw notFound('Message');
    await this.own(actor, m.conversationId);
    const stored = (m.parts as StoredParts | null) ?? { parts: [], citations: [], ruleBased: false };
    const part = stored.parts.find((p) => p.kind === 'card' && p.card.id === cardId);
    if (!part || part.kind !== 'card') throw notFound('Confirmation');
    return { message: m, stored, card: part.card };
  }

  async updateCard(
    actor: Actor,
    messageId: string,
    cardId: string,
    patch: Partial<Pick<ConfirmationCard, 'status' | 'result' | 'error'>>,
  ): Promise<ChatMessageDto> {
    const { message, stored } = await this.card(actor, messageId, cardId);
    const parts = stored.parts.map((p) =>
      p.kind === 'card' && p.card.id === cardId ? { ...p, card: { ...p.card, ...patch } } : p,
    );
    const row = await this.prisma.chatMessage.update({
      where: { id: message.id },
      data: { parts: toJson({ ...stored, parts }) },
    });
    return this.message(row);
  }
}
