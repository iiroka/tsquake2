/*
 * Copyright (C) 1997-2001 Id Software, Inc.
 * Copyright (C) 2018 Yamagi
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or (at
 * your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 59 Temple Place - Suite 330, Boston, MA
 * 02111-1307, USA.
 *
 * =======================================================================
 *
 * Asset downloads over HTTP with CURL.
 *
 * =======================================================================
 */

// // --------

// Startup and shutdown
// --------------------

/*
 * Initializes CURL.
 */
export function CL_InitHTTPDownloads () {
	// We're initializing the cURL backend here because
	// currently we're the only user. As soon as there
	// are other users this must be moved up into the
	// global client intialization.
	// qcurlInit();
}

/*
 * Calls CURL to perform the actual downloads.
 * Must be called every frame, otherwise CURL
 * will starve.
 */
export function  CL_RunHTTPDownloads() {
// 	int	newHandleCount;
// 	CURLMcode ret;

// 	// No HTTP server given or not initialized.
// 	if (!cls.downloadServer[0])
// 	{
// 		return;
// 	}

// 	// Kick CURL into action.
// 	do
// 	{
// 		ret = qcurl_multi_perform(multi, &newHandleCount);

// 		if (newHandleCount < handleCount)
// 		{
// 			CL_FinishHTTPDownload();
// 			handleCount = newHandleCount;
// 		}
// 	}
// 	while (ret == CURLM_CALL_MULTI_PERFORM);

// 	// Somethings gone very wrong.
// 	if (ret != CURLM_OK)
// 	{
// 		Com_Printf("HTTP download: cURL error - %s\n", qcurl_easy_strerror(ret));
// 		CL_CancelHTTPDownloads(true);
// 	}

// 	// Not enough downloads running, start some more.
// 	if (pendingCount && abortDownloads == HTTPDL_ABORT_NONE &&
// 			handleCount < cl_http_max_connections->value &&
// 			!downloadingPak)
// 	{
// 		CL_StartNextHTTPDownload();
// 	}
}

/*
 * Returns true if still downloads pending and false
 * if not. Used by the old UDP code during precache
 * phase to determine if it's necessary to wait for
 * outstanding download.
 */
export function CL_PendingHTTPDownloads(): boolean {
	// if (!cls.downloadServer[0]) {
	// 	return false;
	// }

	// return pendingCount + handleCount;
    return false
}


/*
 * This function should be called from old UDP download code
 * during the precache phase to determine if HTTP downloads
 * for the requested files are possible. Queues the download
 * and returns true if yes, returns fales if not.
 */
export function CL_QueueHTTPDownload(filename: string): boolean {
    return true
}

/*
 * Processesall finished downloads. React on
 * errors, if there're none process the file.
 */
function CL_FinishHTTPDownload() {
	// CURL *curl;
	// char tempName[MAX_OSPATH];
	// dlhandle_t *dl = NULL;
	// int	msgs_in_queue;
	// qboolean isFile;
	// size_t i;

	// do
	// {
	// 	// Get a message from CURL.
	// 	CURLMsg *msg = qcurl_multi_info_read(multi, &msgs_in_queue);

	// 	if (!msg)
	// 	{
	// 		return;
	// 	}

	// 	if (msg->msg != CURLMSG_DONE)
	// 	{
	// 		continue;
	// 	}

	// 	// Find the download handle for the message.
	// 	curl = msg->easy_handle;

	// 	for (i = 0; i < MAX_HTTP_HANDLES; i++)
	// 	{
	// 		if (cls.HTTPHandles[i].curl == curl)
	// 		{
	// 			dl = &cls.HTTPHandles[i];
	// 			break;
	// 		}
	// 	}

	// 	if (i == MAX_HTTP_HANDLES)
	// 	{
	// 		Com_Error(ERR_DROP, "CL_FinishHTTPDownload: Handle not found");
	// 	}

	// 	// Some files aren't saved but read
	// 	// into memory buffers. This is used
	// 	// for filelists only.
	// 	if (dl->file)
	// 	{
	// 		isFile = true;

	// 		// Mkay, it's a file. Let's
	// 		// close it's handle.
	// 		fclose(dl->file);
	// 		dl->file = NULL;
	// 	}
	// 	else
	// 	{
	// 		isFile = false;
	// 	}

	// 	// All downloads might have been aborted.
	// 	// This is the case if the backend (or the
	// 	// whole client) shuts down.
	// 	if (pendingCount)
	// 	{
	// 		pendingCount--;
	// 	}

	// 	// The file finished downloading, it's
	// 	// handle it's now empty and ready for
	// 	// reuse.
	// 	handleCount--;

	// 	// Get the download result (success, some
	// 	// error, etc.) from CURL and process it.
	// 	CURLcode result = msg->data.result;
	// 	long responseCode = 0;

	// 	switch (result)
	// 	{
	// 		case CURLE_HTTP_RETURNED_ERROR:
	// 		case CURLE_OK:
	// 			qcurl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &responseCode);

	// 			if (responseCode == 404)
	// 			{
	// 				Com_Printf("HTTP download: %s - File Not Found\n", dl->queueEntry->quakePath);

	// 				// We got a 404, reset pak downloading state...
	// 				size_t len = strlen(dl->queueEntry->quakePath);

	// 				if (!strcmp(dl->queueEntry->quakePath + len - 4, ".pak")
	// 						|| !strcmp(dl->queueEntry->quakePath + len - 4, ".pk2")
	// 						|| !strcmp(dl->queueEntry->quakePath + len - 4, ".pk3")
	// 						|| !strcmp(dl->queueEntry->quakePath + len - 4, ".zip"))
	// 				{
	// 					downloadingPak = false;
	// 				}

	// 				// ...remove the target file...
	// 				if (isFile)
	// 				{
	// 					Sys_Remove(dl->filePath);
	// 				}

	// 				// ...remove it from the CURL multihandle...
	// 				qcurl_multi_remove_handle(multi, dl->curl);
	// 				CL_RemoveFromQueue(dl->queueEntry);
	// 				dl->queueEntry = NULL;

	// 				// ...and communicate the error.
	// 				if (isFile)
	// 				{
	// 					dlquirks.error = true;
	// 					isFile = false;
	// 				}

	// 				break;

	// 			}
	// 			else if (responseCode == 200)
	// 			{
	// 				Com_Printf("HTTP download: %s - OK\n", dl->queueEntry->quakePath);

	// 				// This wasn't a file, so it must be a filelist.
	// 				if (!isFile && !abortDownloads)
	// 				{
	// 					CL_ParseFileList(dl);
	// 					CL_RemoveFromQueue(dl->queueEntry);
	// 					dl->queueEntry = NULL;
	// 				}

	// 				break;
	// 			}


	// 		// Everything that's not 200 and 404 is fatal, fall through.
	// 		case CURLE_COULDNT_RESOLVE_HOST:
	// 		case CURLE_COULDNT_CONNECT:
	// 		case CURLE_COULDNT_RESOLVE_PROXY:
	// 			Com_Printf("HTTP download: %s - Server broken, aborting\n", dl->queueEntry->quakePath);

	// 			// The download failed. Reset pak downloading state...
	// 			size_t len = strlen(dl->queueEntry->quakePath);

	// 			if (!strcmp(dl->queueEntry->quakePath + len - 4, ".pak")
	// 					|| !strcmp(dl->queueEntry->quakePath + len - 4, ".pk2")
	// 					|| !strcmp(dl->queueEntry->quakePath + len - 4, ".pk3")
	// 					|| !strcmp(dl->queueEntry->quakePath + len - 4, ".zip"))
	// 			{
	// 				downloadingPak = false;
	// 			}

	// 			// remove the temporary file...
	// 			if (isFile)
	// 			{
	// 				Sys_Remove(dl->filePath);
	// 				isFile = false;
	// 			}

	// 			// ...and the handle from CURLs mutihandle.
	// 			qcurl_multi_remove_handle(multi, dl->curl);

	// 			// Special case: We're already aborting HTTP downloading,
	// 			// so we can't just kill everything. Otherwise we'll get
	// 			// stuck.
	// 			if (abortDownloads)
	// 			{
	// 				CL_RemoveFromQueue(dl->queueEntry);
	// 				dl->queueEntry = NULL;
	// 			}

	// 			// Abort all HTTP downloads.
	// 			CL_CancelHTTPDownloads (true);
	// 			CL_RemoveFromQueue(dl->queueEntry);
	// 			dl->queueEntry = NULL;

	// 			break;

	// 		default:
	// 			Com_Printf ("HTTP download: cURL error - %s\n", qcurl_easy_strerror(result));

	// 			// The download failed. Clear the Remove the temporary file...
	// 			if (isFile)
	// 			{
	// 				Sys_Remove(dl->filePath);
	// 				isFile = false;
	// 			}

	// 			// ...and the handle from CURLs mutihandle.
	// 			qcurl_multi_remove_handle (multi, dl->curl);
	// 			CL_RemoveFromQueue(dl->queueEntry);
	// 			dl->queueEntry = NULL;

	// 			break;
	// 	}

	// 	if (isFile)
	// 	{
	// 		// Rename the temporary file to it's final location
	// 		Com_sprintf(tempName, sizeof(tempName), "%s/%s", FS_Gamedir(), dl->queueEntry->quakePath);
	// 		Sys_Rename(dl->filePath, tempName);

	// 		// Pak files are special because they contain
	// 		// other files that we may be downloading...
	// 		i = strlen(tempName);

	// 		// The list of file types must be consistent with fs_packtypes in filesystem.c.
	// 		if ( !strcmp (tempName + i - 4, ".pak") || !strcmp (tempName + i - 4, ".pk2") ||
	// 				!strcmp (tempName + i - 4, ".pk3") || !strcmp (tempName + i - 4, ".zip") )
	// 		{
	// 			FS_AddPAKFromGamedir(dl->queueEntry->quakePath);
	// 			CL_ReVerifyHTTPQueue ();
	// 			downloadingPak = false;
	// 		}

	// 		CL_RemoveFromQueue(dl->queueEntry);
	// 		dl->queueEntry = NULL;
	// 	}

	// 	// Remove the file fo CURLs multihandle.
	// 	qcurl_multi_remove_handle (multi, dl->curl);
	// } while (msgs_in_queue > 0);


	// // No more downloads are in in flight, so...
	// if (handleCount == 0)
	// {
	// 	if (abortDownloads == HTTPDL_ABORT_SOFT)
	// 	{
	// 		// ...if we're soft aborting we're done.
	// 		abortDownloads = HTTPDL_ABORT_NONE;
	// 	}
	// 	else if (abortDownloads == HTTPDL_ABORT_HARD)
	// 	{
	// 		// ...if we're hard aborting we need to prevent future downloads.
	// 		Q_strlcpy(cls.downloadServerRetry, cls.downloadServer, sizeof(cls.downloadServerRetry));
	// 		cls.downloadServer[0] = 0;
	// 	}
	// }

	// // All downloads done. Let's check if we've got more files to
	// // request. This can be the case if we've processed a filelist
	// // or downloaded a BSP that references other assets.
	// if (cls.state == ca_connected && !CL_PendingHTTPDownloads())
	// {
	// 	CL_RequestNextDownload();
	// }
}
