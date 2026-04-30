/**
 * ShareService - Frontend service for creating and managing shares
 * 
 * Handles:
 * - Creating new shares
 * - Retrieving share content
 * - Deleting shares (creator only)
 * - Managing deletion tokens in IndexedDB
 */

import { DBManager } from './DBManager.js';

const API_BASE = '/api';

export class ShareService {
    
    /**
     * Create a new share
     * @param {string} type - 'note', 'list', or 'full'
     * @param {Object} data - The data to share
     * @param {string} title - Display title
     * @returns {Promise<Object>} Share creation response
     */
    static async createShare(type, data, title) {
        console.log('[ShareService] Creating share:', type, title);
        
        const response = await fetch(`${API_BASE}/share`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ type, data, title })
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(error.error || `HTTP ${response.status}`);
        }
        
        const result = await response.json();
        
        // Store deletion token in IndexedDB
        await DBManager.saveDeletionToken(result.shareId, result.deletionToken, result.expiresAt);
        
        console.log('[ShareService] Share created:', result.shareId);
        return result;
    }
    
    /**
     * Get a shared item by ID
     * @param {string} shareId - The share ID
     * @returns {Promise<Object>} Share data
     */
    static async getShare(shareId) {
        console.log('[ShareService] Getting share:', shareId);
        
        const response = await fetch(`${API_BASE}/share/${shareId}`);
        
        if (response.status === 404) {
            // Share not found or expired - clean up token if exists
            await DBManager.deleteDeletionToken(shareId);
            throw new Error('Share not found or expired');
        }
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(error.error || `HTTP ${response.status}`);
        }
        
        const result = await response.json();
        console.log('[ShareService] Share retrieved:', shareId);
        return result;
    }
    
    /**
     * Delete a share (creator only)
     * @param {string} shareId - The share ID
     * @returns {Promise<boolean>} True if deleted successfully
     */
    static async deleteShare(shareId) {
        console.log('[ShareService] Deleting share:', shareId);
        
        // Get deletion token from IndexedDB
        const token = await DBManager.getDeletionToken(shareId);
        if (!token) {
            throw new Error('No deletion token found. You may not have created this share.');
        }
        
        const response = await fetch(`${API_BASE}/share/${shareId}`, {
            method: 'DELETE',
            headers: {
                'X-Deletion-Token': token
            }
        });
        
        if (response.status === 403) {
            throw new Error('Invalid deletion token');
        }
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(error.error || `HTTP ${response.status}`);
        }
        
        // Remove token from IndexedDB
        await DBManager.deleteDeletionToken(shareId);
        
        console.log('[ShareService] Share deleted:', shareId);
        return true;
    }
    
    /**
     * Check if the current user created a share
     * @param {string} shareId - The share ID
     * @returns {Promise<boolean>} True if user has deletion token
     */
    static async isCreator(shareId) {
        const token = await DBManager.getDeletionToken(shareId);
        return !!token;
    }
    
    /**
     * Import shared data to local IndexedDB
     * @param {Object} shareData - The share data object
     */
    static async importToLocal(shareData) {
        console.log('[ShareService] Importing shared data:', shareData.type);
        
        const { ImportExportService } = await import('./ImportExportService.js');
        
        // Create import payload matching our export format
        const importPayload = {
            version: '1.0',
            type: 'pockist-backup',
            scope: shareData.type,
            exportId: `shared-${shareData.id}`,
            exportedAt: shareData.createdAt,
            data: shareData.data
        };
        
        // Use ImportExportService to perform the import
        await ImportExportService.importFromShare(importPayload);
        
        console.log('[ShareService] Import complete');
    }
}
