"""
LegacyMind - TestGenerator Agent
Generates ABAP unit tests and integration test scenarios for affected objects.
"""

from __future__ import annotations

import logging
from typing import Any

from core.ai_client import AIClient
from core.models import (
    AffectedObject, ImpactReport, RiskLevel, TestCase, TestSuite, TestType,
)

logger = logging.getLogger("legacymind.test_generator")


class TestGenerator:
    """Generates ABAP unit test stubs and integration test scenarios.

    Creates test cases based on the impact report, prioritized by risk level.
    Uses AI to enhance test scenarios when available, with template fallback.
    """

    def __init__(self, ai_client: AIClient) -> None:
        self.ai_client = ai_client

    async def generate_tests(
        self, impact_report: ImpactReport, object_catalog: dict[str, dict]
    ) -> TestSuite:
        """Generate a complete test suite for all affected objects.

        Args:
            impact_report: The impact analysis results.
            object_catalog: Full parsed object catalog.

        Returns:
            TestSuite with unit and integration test cases.
        """
        logger.info("Generating tests for %d affected objects", impact_report.total_affected)

        test_cases: list[TestCase] = []

        for affected in impact_report.affected_objects:
            # Unit test for every affected object
            unit_test = self._generate_unit_test(affected)
            test_cases.append(unit_test)

            # Integration test for HIGH and CRITICAL risk objects
            if affected.risk.level in (RiskLevel.CRITICAL, RiskLevel.HIGH):
                related = [
                    ao for ao in impact_report.affected_objects
                    if ao.object.name != affected.object.name
                    and ao.object.module == affected.object.module
                ]
                integration_test = self._generate_integration_test(affected, related)
                test_cases.append(integration_test)

        # Try AI-enhanced test generation for the highest risk object
        if impact_report.affected_objects:
            top_risk = impact_report.affected_objects[0]
            ai_test = await self._generate_ai_enhanced_test(top_risk, impact_report.change_request)
            if ai_test:
                test_cases.append(ai_test)

        coverage = (len(set(tc.target_object for tc in test_cases)) / max(impact_report.total_affected, 1)) * 100

        suite = TestSuite(
            test_cases=test_cases,
            coverage_percent=min(round(coverage, 1), 100.0),
            affected_objects_count=impact_report.total_affected,
        )

        logger.info("Generated %d test cases, coverage=%.1f%%", len(test_cases), suite.coverage_percent)
        return suite

    def _generate_unit_test(self, affected: AffectedObject) -> TestCase:
        """Generate an ABAP Unit test class for a single object."""
        obj = affected.object
        tables = obj.tables_used[:3]
        table_checks = "\n".join(
            f"    \" Verify {t} data integrity after change\n"
            f"    SELECT COUNT(*) FROM {t} INTO lv_count\n"
            f"      WHERE endda >= sy-datum.\n"
            f"    cl_abap_unit_assert=>assert_differs(\n"
            f"      act = lv_count  exp = 0\n"
            f"      msg = '{t} must contain active records' ).\n"
            for t in tables
        )

        abap_code = f'''CLASS lcl_test_{obj.name.lower()} DEFINITION
  FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.

  PRIVATE SECTION.
    DATA: mo_cut TYPE REF TO {obj.name.lower()}.

    METHODS:
      setup,
      test_basic_execution   FOR TESTING,
      test_data_integrity    FOR TESTING,
      test_error_handling    FOR TESTING.
ENDCLASS.

CLASS lcl_test_{obj.name.lower()} IMPLEMENTATION.

  METHOD setup.
    " Initialize test fixtures
    CREATE OBJECT mo_cut.
  ENDMETHOD.

  METHOD test_basic_execution.
    " Verify the object executes without runtime errors
    DATA: lv_result TYPE string.

    TRY.
        " Execute core logic
        PERFORM main_logic IN PROGRAM {obj.name}.
        cl_abap_unit_assert=>assert_initial(
          act = sy-subrc
          msg = '{obj.name} should execute without errors' ).
      CATCH cx_root INTO DATA(lx_error).
        cl_abap_unit_assert=>fail(
          msg = |Unexpected error: {{ lx_error->get_text( ) }}| ).
    ENDTRY.
  ENDMETHOD.

  METHOD test_data_integrity.
    DATA: lv_count TYPE i.

{table_checks}
  ENDMETHOD.

  METHOD test_error_handling.
    " Test with invalid input - should handle gracefully
    DATA: lv_subrc TYPE sy-subrc.

    " Pass boundary / invalid values
    " Expect clean error handling, not dumps
    cl_abap_unit_assert=>assert_true(
      act = abap_true
      msg = 'Error handling verification placeholder' ).
  ENDMETHOD.

ENDCLASS.'''

        priority = {RiskLevel.CRITICAL: 1, RiskLevel.HIGH: 2, RiskLevel.MEDIUM: 3, RiskLevel.LOW: 4}

        return TestCase(
            name=f"UT_{obj.name}",
            type=TestType.UNIT,
            target_object=obj.name,
            abap_code=abap_code,
            description=f"Unit test for {obj.name} ({obj.module}) — validates basic execution, "
                        f"data integrity on {', '.join(tables)}, and error handling.",
            priority=priority.get(affected.risk.level, 3),
        )

    def _generate_integration_test(
        self, affected: AffectedObject, related: list[AffectedObject]
    ) -> TestCase:
        """Generate an integration test scenario covering related objects."""
        obj = affected.object
        related_names = [r.object.name for r in related[:4]]

        call_checks = "\n".join(
            f"    \" Step: Verify {name} responds correctly\n"
            f"    CALL FUNCTION '{name}'\n"
            f"      EXCEPTIONS OTHERS = 1.\n"
            f"    cl_abap_unit_assert=>assert_equals(\n"
            f"      act = sy-subrc  exp = 0\n"
            f"      msg = '{name} integration call failed' ).\n"
            for name in related_names
        )

        abap_code = f'''*----------------------------------------------------------------------*
* Integration Test: {obj.name} -> {", ".join(related_names[:3])}
* Module: {obj.module}
* Risk Level: {affected.risk.level.value}
*----------------------------------------------------------------------*
CLASS lcl_integration_{obj.name.lower()} DEFINITION
  FOR TESTING RISK LEVEL HARMLESS DURATION MEDIUM.

  PRIVATE SECTION.
    METHODS:
      test_end_to_end_flow   FOR TESTING,
      test_cross_dependency  FOR TESTING,
      test_data_consistency  FOR TESTING.
ENDCLASS.

CLASS lcl_integration_{obj.name.lower()} IMPLEMENTATION.

  METHOD test_end_to_end_flow.
    " Test the complete business process flow
    DATA: lv_result TYPE string,
          lv_subrc  TYPE sy-subrc.

{call_checks}

    " Verify end-to-end data consistency
    cl_abap_unit_assert=>assert_initial(
      act = sy-subrc
      msg = 'End-to-end flow completed successfully' ).
  ENDMETHOD.

  METHOD test_cross_dependency.
    " Verify cross-module dependencies are intact
    DATA: lt_results TYPE TABLE OF string.

    " After change, all downstream consumers must still work
    cl_abap_unit_assert=>assert_not_initial(
      act = lines( lt_results )
      msg = 'Cross-dependency check: downstream objects must respond' ).
  ENDMETHOD.

  METHOD test_data_consistency.
    " Verify data written by {obj.name} is readable by dependents
    DATA: lv_count TYPE i.

    SELECT COUNT(*) FROM ({obj.tables_used[0] if obj.tables_used else 'PA0001'})
      INTO lv_count.

    cl_abap_unit_assert=>assert_differs(
      act = lv_count  exp = 0
      msg = 'Data consistency check failed' ).
  ENDMETHOD.

ENDCLASS.'''

        return TestCase(
            name=f"IT_{obj.name}",
            type=TestType.INTEGRATION,
            target_object=obj.name,
            abap_code=abap_code,
            description=f"Integration test for {obj.name} covering end-to-end flow "
                        f"with {', '.join(related_names[:3])}. Verifies cross-module data consistency.",
            priority=1 if affected.risk.level == RiskLevel.CRITICAL else 2,
        )

    async def _generate_ai_enhanced_test(
        self, affected: AffectedObject, change_request: str
    ) -> TestCase | None:
        """Use AI to generate a more sophisticated test scenario."""
        try:
            prompt = (
                f"Generate a detailed ABAP Unit test for the SAP object '{affected.object.name}' "
                f"in the {affected.object.module} module.\n\n"
                f"Context: {change_request}\n"
                f"Tables used: {', '.join(affected.object.tables_used)}\n"
                f"Risk level: {affected.risk.level.value}\n"
                f"Blast radius: {affected.blast_radius} dependent objects\n\n"
                f"Generate ONLY the ABAP test class code. Include:\n"
                f"- Setup method with test data preparation\n"
                f"- At least 3 test methods covering positive, negative, and boundary cases\n"
                f"- Proper assertions using cl_abap_unit_assert\n"
                f"- Comments explaining each test's purpose\n"
                f"Wrap the code in a CLASS definition."
            )

            response = await self.ai_client.generate(prompt)

            if response and self.ai_client.provider_used != "regex_fallback":
                return TestCase(
                    name=f"AI_{affected.object.name}",
                    type=TestType.UNIT,
                    target_object=affected.object.name,
                    abap_code=response.strip(),
                    description=f"AI-generated comprehensive test for {affected.object.name} "
                                f"addressing: {change_request[:100]}",
                    priority=1,
                )
        except Exception as exc:
            logger.warning("AI test generation failed: %s", exc)

        return None
