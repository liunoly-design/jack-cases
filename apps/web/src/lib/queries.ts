import {QueryClient} from '@tanstack/react-query';
export const createPrivateClient=()=>new QueryClient({defaultOptions:{queries:{retry:false}}});
// Only taxonomy is shared. Cases, keys, requirements and files remain account-private.
export const publicClient=createPrivateClient();
export function disposePrivateClient(client:QueryClient){void client.cancelQueries();client.clear();}
