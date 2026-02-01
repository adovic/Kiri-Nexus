import { NextResponse } from 'next/server';

// =============================================================================
// GOVERNMENT AZURE CONFIG CHECK API
// =============================================================================
// Returns the Azure OpenAI configuration status for government demo.
// This endpoint does NOT expose actual credentials - only configuration status.
//
// Used by: /government/demo/call to verify Azure is configured before starting
//
// Required Environment Variables:
//   AZURE_OPENAI_ENDPOINT - Azure OpenAI resource endpoint
//   AZURE_OPENAI_API_KEY - Azure OpenAI API key
//   AZURE_OPENAI_DEPLOYMENT_NAME - Deployment name (e.g., gpt-4o)
// =============================================================================

interface AzureConfigStatus {
  configured: boolean;
  provider: 'azure' | 'none';
  missingVars?: string[];
  hint?: string;
  // For Vapi Azure OpenAI integration
  azureConfig?: {
    resourceName: string;
    deploymentName: string;
  };
}

function checkAzureConfig(): AzureConfigStatus {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.trim();
  const apiKey = process.env.AZURE_OPENAI_API_KEY?.trim();
  const deploymentName = (
    process.env.AZURE_OPENAI_DEPLOYMENT_NAME ||
    process.env.AZURE_OPENAI_DEPLOYMENT ||
    process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT
  )?.trim();

  const missing: string[] = [];

  if (!endpoint || endpoint.startsWith('YOUR_')) {
    missing.push('AZURE_OPENAI_ENDPOINT');
  }
  if (!apiKey || apiKey.startsWith('YOUR_')) {
    missing.push('AZURE_OPENAI_API_KEY');
  }
  if (!deploymentName || deploymentName.startsWith('YOUR_') || deploymentName.startsWith('your-')) {
    missing.push('AZURE_OPENAI_DEPLOYMENT_NAME');
  }

  if (missing.length > 0) {
    return {
      configured: false,
      provider: 'none',
      missingVars: missing,
      hint: `Configure Azure OpenAI for government demo: ${missing.join(', ')}`,
    };
  }

  // Extract resource name from endpoint URL
  // Format: https://<resource-name>.openai.azure.com
  // At this point, endpoint is guaranteed to be defined (we returned early if missing)
  let resourceName = '';
  try {
    const url = new URL(endpoint!);
    resourceName = url.hostname.split('.')[0];
  } catch {
    resourceName = endpoint!.replace(/https?:\/\//, '').split('.')[0];
  }

  return {
    configured: true,
    provider: 'azure',
    azureConfig: {
      resourceName,
      deploymentName: deploymentName!,
    },
  };
}

export async function GET() {
  const config = checkAzureConfig();

  if (!config.configured) {
    // Return 503 to indicate service not available
    console.warn('[/api/government/azure-config] Azure OpenAI not configured:', config.missingVars);
    return NextResponse.json(
      {
        error: 'Government demo requires Azure OpenAI configuration',
        configRequired: true,
        ...config,
      },
      { status: 503 }
    );
  }

  // Return config (without sensitive data)
  return NextResponse.json({
    status: 'ok',
    ...config,
  });
}
