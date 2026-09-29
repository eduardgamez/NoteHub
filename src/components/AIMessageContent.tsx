import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { formatAssistantMessage } from '../ai/formatMessage';

export function AIMessageContent({ content }: { content: string }) {
  return <div className="message-markdown"><Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{formatAssistantMessage(content)}</Markdown></div>;
}
