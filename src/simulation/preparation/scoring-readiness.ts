/** Complete numerical inputs alone do not authorize using disputed source rows. */
export function historicalScoringReadiness(input:{valid:boolean;missingRequiredInputs:readonly string[];selectedRole:boolean;participation:string;sourceComparisonStatus:'AGREEMENT'|'CONFLICT'|'SOURCE_UNMATCHED'|'INCOMPLETE_COMPARISON'}){
 const reasons:string[]=[];
 if(!input.valid)reasons.push('INVALID_ARCHIVE_ROW');
 if(input.missingRequiredInputs.length)reasons.push('MISSING_REQUIRED_V9_INPUTS');
 if(input.sourceComparisonStatus!=='AGREEMENT')reasons.push(input.sourceComparisonStatus==='CONFLICT'?'UNRESOLVED_KNOWN_SOURCE_VECTOR_CONFLICT':'SOURCE_VECTOR_CORROBORATION_INCOMPLETE');
 if(!input.selectedRole)reasons.push('NO_SELECTED_SCORING_ROLE');
 if(input.participation!=='PLAYED')reasons.push(input.participation==='DID_NOT_PLAY'?'EXPLICIT_DID_NOT_PLAY':'PARTICIPATION_UNKNOWN');
 return{inputComplete:input.valid&&!input.missingRequiredInputs.length,fullKnownBaseVectorAgreement:input.sourceComparisonStatus==='AGREEMENT',retrospectiveScoringEligible:reasons.length===0,strictSimulationEligible:false,withholdReasons:reasons};
}
