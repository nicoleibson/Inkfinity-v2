// src/app/terms/page.tsx
import { promises as fs } from 'fs';
import path from 'path';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// This is a basic markdown to HTML converter.
// For a production app, a more robust library like 'marked' or 'react-markdown' would be better.
function markdownToHtml(markdown: string): string {
    return markdown
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
        .replace(/\*(.*)\*/gim, '<em>$1</em>')
        .replace(/^- (.*$)/gim, '<ul><li>$1</li></ul>') // Basic list support
        .replace(/<\/ul><ul>/gim, '') // Merge consecutive lists
        .replace(/\n/g, '<br />'); // Replace newlines with <br>
}

export default async function TermsPage() {
    // Read the markdown file from the filesystem.
    // path.join is used to create a platform-independent path.
    const filePath = path.join(process.cwd(), 'docs', 'TERMS_AND_CONDITIONS.md');
    const markdownContent = await fs.readFile(filePath, 'utf-8');
    const htmlContent = markdownToHtml(markdownContent);

    return (
        <div className="max-w-4xl mx-auto">
            <Card>
                <CardHeader>
                    <CardTitle className="font-headline text-3xl">Terms and Conditions</CardTitle>
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
