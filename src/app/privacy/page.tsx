// src/app/privacy/page.tsx
import { promises as fs } from 'fs';
import path from 'path';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function markdownToHtml(markdown: string): string {
  return markdown
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*)\*/gim, '<em>$1</em>')
    .replace(/^- (.*$)/gim, '<ul><li>$1</li></ul>')
    .replace(/<\/ul><ul>/gim, '')
    .replace(/\n/g, '<br />');
}

export default async function PrivacyPage() {
  const filePath = path.join(process.cwd(), 'docs', 'PRIVACY_POLICY.md');
  const markdownContent = await fs.readFile(filePath, 'utf-8');
  const htmlContent = markdownToHtml(markdownContent);

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline text-3xl">Privacy Policy</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="prose dark:prose-invert prose-h1:font-headline prose-h1:text-2xl prose-h2:font-headline prose-h3:font-headline"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
