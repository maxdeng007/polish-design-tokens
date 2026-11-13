/**
 * Count alias chain depth in a value.
 */
function countAliasDepth(value) {
  let depth = 0;
  let current = value;
  
  while (current.startsWith('var(')) {
    depth++;
    const match = current.match(/var\(\s*(--[^\s,]+)[^,]*,/);
    if (!match) break;
    current = match[1];
  }
  
  return depth;
}

/**
 * Provide agent-assisted recommendations for improving token hygiene.
 * 
 * @param {object} params - Tool parameters
 * @param {string} params.jobId - Job UUID
 * @param {boolean} [params.autoFixOnly] - Only return low-risk suggestions
 * @param {string[]} [params.categories] - Filter by categories (merge, alias, naming)
 * @param {object} deps - Dependencies
 * @param {object} deps.store - JobStore
 * @returns {Promise<{recommendations: Array<{}>, total: number, summary: {}}}>}
 */
export async function audit_recommendations(params, deps) {
  const { jobId, autoFixOnly = false, categories = null } = params;
  const job = await deps.store.get(jobId);
  
  if (!job || !job.declarations) {
    throw new Error(`Job ${jobId} does not contain scan data`);
  }

  const recommendations = [];
  const declarationsMap = new Map();
  const findingsByType = new Map();

  // Index declarations
  for (const decl of job.declarations) {
    declarationsMap.set(decl.name, decl);
  }

  // Index findings from report
  for (const finding of job.findings || []) {
    if (!findingsByType.has(finding.id)) {
      findingsByType.set(finding.id, []);
    }
    findingsByType.get(finding.id).push(finding);
  }

  // Rule 1: Orphan token merge suggestions
  if (!categories || categories.includes('merge')) {
    const orphanFindings = findingsByType.get('orphan') || [];
    
    for (const orphan of orphanFindings) {
      const orphanName = orphan.detail.match(/'([^']+)'/)?.[1] || orphan.title.match(/'([^']+)'/)?.[1];
      if (!orphanName) continue;
      
      const orphanDecl = declarationsMap.get(orphanName);
      if (!orphanDecl || !orphanDecl.resolved) continue;
      
      // Find active token with same value
      for (const [name, decl] of declarationsMap) {
        if (name === orphanName) continue;
        
        // Check if this token has references (is actively used)
        const hasReferences = decl.references && decl.references.length > 0;
        const isSameValue = decl.resolved && decl.resolved === orphanDecl.resolved;
        
        if (hasReferences && isSameValue) {
          recommendations.push({
            id: `merge-${orphanName}-${name}`,
            type: 'merge',
            current: orphanName,
            suggested: name,
            confidence: 1.0, // High confidence: same value, one used one unused
            reasoning: `Both use \`${orphanDecl.resolved}\` but \`${name}\` is referenced while \`${orphanName}\` is never used`,
            affected_findings: [orphan.id],
            risk: 'low'
          });
          break; // Only suggest one merge per orphan
        }
      }
    }
  }

  // Rule 2: Deep alias chain flattening
  if (!categories || categories.includes('alias')) {
    for (const [name, decl] of declarationsMap) {
      if (decl.value && decl.value.startsWith('var(')) {
        const depth = countAliasDepth(decl.value);
        if (depth >= 3) {
          recommendations.push({
            id: `alias-flatten-${name}`,
            type: 'alias',
            current: decl.value,
            suggested: `Consider flattening to direct value or fewer hops`,
            confidence: 0.7, // Medium: need to check intermediate usage
            reasoning: `Alias chain depth ${depth} may make maintenance harder`,
            affected_findings: [],
            risk: depth >= 4 ? 'medium' : 'low'
          });
        }
      }
    }
  }

  // Rule 3: Inconsistent naming patterns (info-level)
  if (!categories || categories.includes('naming')) {
    const dashCount = new Map();
    
    for (const decl of job.declarations) {
      const dashes = (decl.name.match(/-/g) || []).length;
      dashCount.set(dashes, (dashCount.get(dashes) || 0) + 1);
    }

    if (dashCount.size > 2) {
      recommendations.push({
        id: 'naming-inconsistency',
        type: 'rename',
        current: 'mixed-naming-patterns',
        suggested: 'standardize on single hyphenation scheme',
        confidence: 0.5, // Lower: stylistic preference
        reasoning: 'Project uses inconsistent hyphenation depths (' + 
                   Array.from(dashCount.entries()).map(([k, v]) => `${v} tokens with ${k}-hyphens`).join(', ') + 
                   '). Consider choosing one pattern.',
        affected_findings: [],
        risk: 'low'
      });
    }
  }

  // Filter by autoFixOnly if requested
  if (autoFixOnly) {
    recommendations.filter(r => r.risk === 'low' && r.confidence >= 0.8);
  }

  return {
    recommendations,
    total: recommendations.length,
    summary: {
      merge: recommendations.filter(r => r.type === 'merge').length,
      alias: recommendations.filter(r => r.type === 'alias').length,
      rename: recommendations.filter(r => r.type === 'rename').length
    }
  };
}
