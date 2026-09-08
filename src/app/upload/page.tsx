import UploadForm from "./upload-form";

export default function UploadPage() {
    return (
        <div>
            <div className="text-center mb-8">
                <h1 className="text-4xl font-headline font-bold text-primary">Upload Your Artwork</h1>
                <p className="text-muted-foreground mt-2">Share your masterpiece with the world. Our AI will help you with the details.</p>
            </div>
            <UploadForm />
        </div>
    );
}
